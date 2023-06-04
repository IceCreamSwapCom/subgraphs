/* eslint-disable prefer-const */
import { BigDecimal, Address, log } from "@graphprotocol/graph-ts/index";
import { Pair, Token, Bundle } from "../generated/schema";
import {ZERO_BD, factoryContract, ADDRESS_ZERO, ONE_BD, FACTORY_ADDRESS} from "./utils";

let WBNB_ADDRESS = "0x0eb9036cbe0f052386f36170c6b07ef0a0e3f710";  // needs to be lower case
const USDC_WETH_PAIR_OLD = '0x9c597044bb020a4862d7d74052a8f545cdc1b8d1'
const USDT_WETH_PAIR_OLD = '0x8c243d7b04e0f8f78dc87c8c2297581310468129'
const USDT_WETH_PAIR = '0x8e7dd0d762f60942e0bd05b1114d6cedf4435a18'
const USDC_WETH_PAIR = '0x7b970fba17679054d4865b2c6181baf12080b6a3'

export function getBnbPriceInUSD(): BigDecimal {
  // fetch eth prices for each stablecoin
  // all stable coins are token1 (2.) by pure luck, so no need to reverse rates
  let usdcPairOld = Pair.load(USDC_WETH_PAIR_OLD)
  let usdtPairOld = Pair.load(USDT_WETH_PAIR_OLD)
  let usdtPair = Pair.load(USDT_WETH_PAIR)
  let usdcPair = Pair.load(USDC_WETH_PAIR)

  let totalLiquidityETH = ZERO_BD
  let totalLiquidityUSD = ZERO_BD

  if (usdcPairOld !== null) {
    totalLiquidityUSD = totalLiquidityUSD.plus(usdcPairOld.reserve1)
    totalLiquidityETH = totalLiquidityETH.plus(usdcPairOld.reserve0)
  }
  if (usdtPairOld !== null) {
    totalLiquidityUSD = totalLiquidityUSD.plus(usdtPairOld.reserve1)
    totalLiquidityETH = totalLiquidityETH.plus(usdtPairOld.reserve0)
  }
  if (usdtPair !== null) {
    totalLiquidityUSD = totalLiquidityUSD.plus(usdtPair.reserve1)
    totalLiquidityETH = totalLiquidityETH.plus(usdtPair.reserve0)
  }
  if (usdcPair !== null) {
    totalLiquidityUSD = totalLiquidityUSD.plus(usdcPair.reserve1)
    totalLiquidityETH = totalLiquidityETH.plus(usdcPair.reserve0)
  }

  if (totalLiquidityETH.equals(ZERO_BD)) {
    return ZERO_BD
  }
  return totalLiquidityUSD.div(totalLiquidityETH)
}

// token where amounts should contribute to tracked volume and liquidity
let WHITELIST: string[] = [
  '0x0eb9036cbe0f052386f36170c6b07ef0a0e3f710', // WBRISE
  '0xb999ea90607a826a3e6e6646b404c3c7d11fa39d', // ICE
  '0xc7e6d7e08a89209f02af47965337714153c529f0', // USDTi
  '0xaedd3ff7b9fc5fc4e44d140b80f0b1c7fdb6102c', // USDCi
  '0xc3b730dd10a7e9a69204bdf6cb5a426e4f1f09e3', // LunaGens
  '0xe3f5a90f9cb311505cd691a46596599aa1a0ad7d', // USDT
  '0x765277eebeca2e31912c9946eae1021199b39c61', // USDC
  '0x31226b28add9062c5064a9bd35ea155f323c6ca6', // PRDS
  '0x11203a00a9134db8586381c4b2fca0816476b3fd', // YPC
  '0x71946a5c9da7c95ee804a9be561ec15a3f286a7d', // BPAD
  '0x41c5ae56681fb19334ecf7d914919805dae2ec8f', // BROGE
  '0x9b8535dd9281e48484725bc9eb6ed2f66cea2a36', // BRZILLA
  '0xd6447d2fa919811c41a064bdbdab1e281f8de9b2', // VEF
  '0xc89fcd3e1cf5a355fc41e160d18bac5f624610d4', // WMF
  '0x0e11dce06ef2fed6f78cef5144f970e1184b4298', // SPHYNX
];

// minimum liquidity for price to get tracked
let MINIMUM_LIQUIDITY_THRESHOLD_BNB = BigDecimal.fromString("100000000");

/**
 * Search through graph to find derived BNB per token.
 * @todo update to be derived BNB (add stablecoin estimates)
 **/
export function findBnbPerToken(token: Token): BigDecimal {
  if (token.id == WBNB_ADDRESS) {
    return ONE_BD;
  }
  // loop through whitelist and check if paired with any
  for (let i = 0; i < WHITELIST.length; ++i) {
    // getPair should be suficcient, but for some reason this call sometimes reverts on Bitgert, so trying to work around that...
    let pairAddressResult = factoryContract.try_getPair(Address.fromString(token.id), Address.fromString(WHITELIST[i]));
    if (pairAddressResult.reverted) {
      log.error("call to factory.getPair reverted, which should never happen... " + "token0: " + token.id + ", token1: " + WHITELIST[i], [])
      continue
    }
    let pairAddress = pairAddressResult.value
    if (pairAddress.toHex() != ADDRESS_ZERO) {
      let pair = Pair.load(pairAddress.toHex());
      if (pair.token0 == token.id && pair.reserveBNB.gt(MINIMUM_LIQUIDITY_THRESHOLD_BNB)) {
        let token1 = Token.load(pair.token1);
        return pair.token1Price.times(token1.derivedBNB as BigDecimal); // return token1 per our token * BNB per token 1
      }
      if (pair.token1 == token.id && pair.reserveBNB.gt(MINIMUM_LIQUIDITY_THRESHOLD_BNB)) {
        let token0 = Token.load(pair.token0);
        return pair.token0Price.times(token0.derivedBNB as BigDecimal); // return token0 per our token * BNB per token 0
      }
    }
  }
  return ZERO_BD; // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts
 * If neither is, return 0
 */
export function getTrackedVolumeUSD(
    bundle: Bundle,
    tokenAmount0: BigDecimal,
    token0: Token,
    tokenAmount1: BigDecimal,
    token1: Token
): BigDecimal {
  let price0 = token0.derivedBNB.times(bundle.bnbPrice);
  let price1 = token1.derivedBNB.times(bundle.bnbPrice);

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1)).div(BigDecimal.fromString("2"));
  }

  // take full value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0);
  }

  // take full value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1);
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD;
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedLiquidityUSD(
    bundle: Bundle,
    tokenAmount0: BigDecimal,
    token0: Token,
    tokenAmount1: BigDecimal,
    token1: Token
): BigDecimal {
  let price0 = token0.derivedBNB.times(bundle.bnbPrice);
  let price1 = token1.derivedBNB.times(bundle.bnbPrice);

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1));
  }

  // take double value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).times(BigDecimal.fromString("2"));
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1).times(BigDecimal.fromString("2"));
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD;
}
