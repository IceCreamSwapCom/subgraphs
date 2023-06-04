/* eslint-disable prefer-const */
import { BigDecimal, Address, log } from "@graphprotocol/graph-ts/index";
import { Pair, Token, Bundle } from "../generated/schema";
import {ZERO_BD, factoryContract, ADDRESS_ZERO, ONE_BD, FACTORY_ADDRESS} from "./utils";

let WCORE_ADDRESS = "0x40375c92d9faf44d2f9db9bd9ba41a3317a2404f";  // needs to be lower case
const USDT_WETH_PAIR = '0x5ebae3a840ff34b107d637c8ed07c3d1d2017178'

export function getBnbPriceInUSD(): BigDecimal {
  // fetch eth prices for each stablecoin
  // all stable coins are token1 (2.) by pure luck, so no need to reverse rates
  let usdtPair = Pair.load(USDT_WETH_PAIR)

  if (usdtPair !== null) {
    return usdtPair.token1Price
  }
  return ZERO_BD
}

// token where amounts should contribute to tracked volume and liquidity
let WHITELIST: string[] = [
  '0x40375c92d9faf44d2f9db9bd9ba41a3317a2404f', // WCORE
  '0xa20b3b97df3a02f9185175760300a06b4e0a2c05', // SCORE
  '0xc0e49f8c615d3d4c245970f6dc528e4a47d69a44', // ICE
  '0x81bcea03678d1cef4830942227720d542aa15817', // USDT (IceCreamSwap Bridge)
  '0xd2683b22287e63d22928cbe4514003a92507f474', // USDC (IceCreamSwap Bridge)
  '0x8687cd1d02a28098571067ddb18f33fef667c929', // BUSD (IceCreamSwap Bridge)
  '0x1f82d787a1186c67360e62869c46eadbc192846a', // DAI (IceCreamSwap Bridge)
  '0x12aa82525deff84777fa78578a68ceb854a85f43', // BNB (IceCreamSwap Bridge)
  '0xef6b7bc74c9354bcf2e3f2a068e4b0b5cdf08f29', // ETH (IceCreamSwap Bridge)
];

// minimum liquidity for price to get tracked
let MINIMUM_LIQUIDITY_THRESHOLD_BNB = BigDecimal.fromString("10");

/**
 * Search through graph to find derived BNB per token.
 * @todo update to be derived BNB (add stablecoin estimates)
 **/
export function findBnbPerToken(token: Token): BigDecimal {
  if (token.id == WCORE_ADDRESS) {
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
