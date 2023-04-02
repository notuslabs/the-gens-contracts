require("dotenv").config();

require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("solidity-coverage");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

const PRIVATE_KEY = ""


// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.9",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200000,
      },
      outputSelection: {
        "*": {
          "*": ["devdoc", "userdoc", "storageLayout"],
        },
      },
    },
  },
  networks: {
    aurora: {
      accounts: [PRIVATE_KEY],
      chainId: 1313161555,
      url: 'https://testnet.aurora.dev	'
    },
    auroramain: {
      accounts: [PRIVATE_KEY],
      chainId: 1313161554,
      url: 'https://mainnet.aurora.dev'
    },  
    hardhat: {
      forking: {
        url: 'https://mainnet.aurora.dev'
      }
    }
}}

if (process.env.MAINNET_PRIVATE_KEY) {
  module.exports.networks = {
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [`${process.env.MAINNET_PRIVATE_KEY}`],
    },
  };
}

if (process.env.ETHERSCAN_API_KEY) {
  module.exports.etherscan = {
    apiKey: process.env.ETHERSCAN_API_KEY,
  };
}
