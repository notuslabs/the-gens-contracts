const hre = require("hardhat");
const { ethers } = hre;

const TEST_CASES = [];

TEST_CASES.push(async function* deployShardwallet(props) {
  const sw = await props.factories.Shardwallet.deploy();
  await sw.deployed();
  yield ["Shardwallet deploy", await sw.deployTransaction.wait()];
});

TEST_CASES.push(async function* deployTicketAndTrnf(props) {
  const ticket = await props.factories.Ticket.deploy(999);
  await ticket.deployed();
  yield ["Ticket deploy", await ticket.deployTransaction.wait()];

  const trnf = await props.factories.TRNF.deploy(ticket.address);
  await trnf.deployed();
  yield ["TRNF deploy", await trnf.deployTransaction.wait()];
});

TEST_CASES.push(async function* shardwalletBasics(props) {
  const [alice] = props.signers;
  const sw = await props.factories.Shardwallet.deploy();
  await sw.deployed();
  const weth9 = await props.factories.TestERC20.deploy();
  await weth9.deployed();

  // Populate the ERC-20 balance storage slot for the claim recipient so that
  // we don't pay that gas cost while profiling.
  await weth9.mint(alice.address, 1);

  const ETH = ethers.constants.AddressZero; // as an `IERC20`
  const oneMillion = 1e6;
  await alice.sendTransaction({ to: sw.address, value: oneMillion });
  await weth9.mint(sw.address, oneMillion);

  yield [
    "Shardwallet: split with 3 children",
    await sw
      .split(1, [
        { shareMicros: 500000, recipient: alice.address }, // shard 2
        { shareMicros: 300000, recipient: alice.address }, // shard 3
        { shareMicros: 100000, recipient: alice.address }, // shard 4
        { shareMicros: 100000, recipient: alice.address }, // shard 5
      ])
      .then((tx) => tx.wait()),
  ];

  yield [
    "Shardwallet: merge with 2 parents",
    await sw.merge([4, 5]).then((tx) => tx.wait()), // shard 6
  ];

  yield [
    "Shardwallet: ETH claim initializing 3 records",
    await sw.claim(6, [ETH]).then((tx) => tx.wait()),
  ];
  yield [
    "Shardwallet: ERC-20 claim initializing 3 records",
    await sw.claim(6, [weth9.address]).then((tx) => tx.wait()),
  ];

  yield [
    "Shardwallet: ETH claim initializing 1 record",
    await sw.claim(2, [ETH]).then((tx) => tx.wait()),
  ];
  yield [
    "Shardwallet: ERC-20 claim initializing 1 record",
    await sw.claim(2, [weth9.address]).then((tx) => tx.wait()),
  ];

  yield [
    "Shardwallet: no-op ETH claim",
    await sw.claim(2, [ETH]).then((tx) => tx.wait()),
  ];
  yield [
    "Shardwallet: no-op ERC-20 claim",
    await sw.claim(2, [weth9.address]).then((tx) => tx.wait()),
  ];

  await alice.sendTransaction({ to: sw.address, value: oneMillion });
  await weth9.mint(sw.address, oneMillion);

  yield [
    "Shardwallet: ETH claim updating 1 existing record (typical claim)",
    await sw.claim(2, [ETH]).then((tx) => tx.wait()),
  ];
  yield [
    "Shardwallet: ERC-20 claim updating 1 existing record (typical claim)",
    await sw.claim(2, [weth9.address]).then((tx) => tx.wait()),
  ];
  yield [
    "Shardwallet: combined ETH/ERC-20 claim updating 1 existing record per currency (typical claim)",
    await sw.claim(6, [ETH, weth9.address]).then((tx) => tx.wait()),
  ];

  yield [
    "Shardwallet: reforging 3 parents into 2 children",
    await sw
      .reforge(
        [2, 3, 6],
        [
          { shareMicros: 800000, recipient: alice.address }, // shard 7
          { shareMicros: 200000, recipient: alice.address }, // shard 8
        ]
      )
      .then((tx) => tx.wait()),
  ];
});

const Mode = Object.freeze({
  TEXT: "TEXT",
  JSON: "JSON",
});

async function main() {
  await hre.run("compile", { quiet: true });
  const { mode, patterns } = parseArgs();
  function testCaseMatches(name) {
    if (patterns.length === 0) return true;
    return patterns.some((p) => name.match(p));
  }
  const contractNames = ["Shardwallet", "TRNF", "TestERC20", "Ticket"];
  const factories = {};
  await Promise.all(
    contractNames.map(async (name) => {
      factories[name] = await ethers.getContractFactory(name);
    })
  );
  let allPassed = true;
  for (const testCase of TEST_CASES) {
    if (!testCaseMatches(testCase.name)) continue;
    try {
      const gen = testCase({
        factories,
        signers: await ethers.getSigners(),
      });
      for await (const [label, gasOrReceipt] of gen) {
        let gas;
        if (ethers.BigNumber.isBigNumber(gasOrReceipt.gasUsed)) {
          gas = gasOrReceipt.gasUsed;
        } else {
          gas = gasOrReceipt;
        }
        switch (mode) {
          case Mode.TEXT:
            console.log(`${label}: ${formatGas(gas)}`);
            break;
          case Mode.JSON: {
            const keccak = ethers.utils.keccak256(
              ethers.utils.toUtf8Bytes(label)
            );
            const hash = ethers.BigNumber.from(
              ethers.utils.hexDataSlice(keccak, 0, 6)
            )
              .toBigInt()
              .toString(32)
              .padStart(10, "0");
            const blob = { hash, label, gas: gas.toString() };
            console.log(JSON.stringify(blob));
            break;
          }
          default:
            throw new Error(`Unexpected mode: ${mode}`);
        }
      }
    } catch (e) {
      allPassed = false;
      console.error(`Error in ${testCase.name}:`, e);
    }
  }
  if (!allPassed) process.exitCode = 1;
}

function parseArgs() {
  let mode = Mode.TEXT;
  const rawArgs = process.argv.slice(2);
  const patterns = [];
  let moreFlags = true;
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (moreFlags && arg === "--") {
      moreFlags = false;
      continue;
    }
    if (moreFlags && arg.startsWith("-")) {
      if (arg === "-j" || arg === "--json") {
        mode = Mode.JSON;
        continue;
      }
      if (arg === "-t" || arg === "--text") {
        mode = Mode.TEXT;
        continue;
      }
      throw `In argument ${i + 1}: Unknown flag "${arg}"`;
    }
    try {
      patterns.push(RegExp(arg, "i"));
    } catch (e) {
      throw `In argument ${i + 1}: ${e.message}`;
    }
  }
  return { patterns, mode };
}

function formatGas(gas, samplePrice = 10n ** 9n * 50n) {
  const sampleCost = ethers.utils.formatUnits(gas.mul(samplePrice));
  const gweiStr = ethers.utils.formatUnits(samplePrice, 9);
  const costStr = `${sampleCost} ETH @ ${gweiStr} gwei/gas`;
  return `${gas.toString()} gas (${costStr})`;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});