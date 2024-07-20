/**
 * @type import('./config').NetworkConfig
 */
module.exports = {
  network: "lightlink",
  wNativeAddress: "0x7EbeF2A4b1B09381Ec5B9dF8C5c6f2dBECA59c73".toLowerCase(),
  v2: {
    factoryAddress: "0xC87De04e2EC1F4282dFF2933A2D58199f688fC3d".toLowerCase(),
    startBlock: 79635816,
    wNativeStablePair0: "0x119258E1e790fcD812915936C5f2447ecf8F6Ad1".toLowerCase(), // WETH/USDC
    wNativeStablePair1: "0x0000000000000000000000000000000000000000".toLowerCase(),
    whitelistAddresses: [
      "0x7EbeF2A4b1B09381Ec5B9dF8C5c6f2dBECA59c73".toLowerCase(), // WETH
      "0x18fB38404DADeE1727Be4b805c5b242B5413Fa40".toLowerCase(), // USDC
    ],
    minNativeForPricing: "0.1",
  },
};
