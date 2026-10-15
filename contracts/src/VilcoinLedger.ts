import { Bool, Field, SmartContract, state, State, method, UInt64, Struct } from "o1js";

/**
 * Per-market VILCOIN AMM liquidity pool, proven on Mina (PRD 5.3/3: "Liquidity
 * calculations run locally and are verified via Mina zkApps").
 *
 * Uses a constant-product (x*y=k) curve between the two outcome reserves as a
 * POC stand-in for the LMSR curve referenced in the PRD's Expert Mode UI
 * (section 4) — swapping in a true LMSR market maker is later-phase work and
 * does not change the zkApp's state-transition shape below.
 */

type TradeEventShape = {
  outcomeIndex: typeof Field;
  amountIn: typeof UInt64;
  outcomeAPool: typeof UInt64;
  outcomeBPool: typeof UInt64;
};

const TradeEventStruct: ReturnType<typeof Struct<TradeEventShape>> = Struct({
  outcomeIndex: Field,
  amountIn: UInt64,
  outcomeAPool: UInt64,
  outcomeBPool: UInt64,
});

export class TradeEvent extends TradeEventStruct {}

export class VilcoinLedger extends SmartContract {
  @state(UInt64) outcomeAPool = State<UInt64>();
  @state(UInt64) outcomeBPool = State<UInt64>();
  @state(UInt64) totalVolume = State<UInt64>();
  @state(Bool) seeded: State<Bool> = State<Bool>();

  events = {
    trade: TradeEvent,
  };

  init() {
    super.init();
    this.outcomeAPool.set(UInt64.zero);
    this.outcomeBPool.set(UInt64.zero);
    this.totalVolume.set(UInt64.zero);
    this.seeded.set(Bool(false));
  }

  /** One-time liquidity seeding, immediately after deployment. */
  @method async seedLiquidity(initialLiquidity: UInt64) {
    this.seeded.getAndRequireEquals().assertFalse();
    initialLiquidity.assertGreaterThan(UInt64.zero);

    this.outcomeAPool.set(initialLiquidity);
    this.outcomeBPool.set(initialLiquidity);
    this.seeded.set(Bool(true));
  }

  /** Buys outcome A by paying `amountIn` VILCOIN into the outcome-B reserve. */
  @method async buyOutcomeA(amountIn: UInt64) {
    amountIn.assertGreaterThan(UInt64.zero);

    const poolA = this.outcomeAPool.getAndRequireEquals();
    const poolB = this.outcomeBPool.getAndRequireEquals();
    const volume = this.totalVolume.getAndRequireEquals();

    const k = poolA.mul(poolB);
    const newPoolB = poolB.add(amountIn);
    const newPoolA = k.divMod(newPoolB).quotient;
    // Guards against a pool reaching zero, which would make k=0 and brick all future trades.
    newPoolA.assertGreaterThan(UInt64.zero);

    this.outcomeAPool.set(newPoolA);
    this.outcomeBPool.set(newPoolB);
    this.totalVolume.set(volume.add(amountIn));

    this.emitEvent(
      "trade",
      new TradeEvent({ outcomeIndex: Field(0), amountIn, outcomeAPool: newPoolA, outcomeBPool: newPoolB }),
    );
  }

  /** Buys outcome B by paying `amountIn` VILCOIN into the outcome-A reserve. */
  @method async buyOutcomeB(amountIn: UInt64) {
    amountIn.assertGreaterThan(UInt64.zero);

    const poolA = this.outcomeAPool.getAndRequireEquals();
    const poolB = this.outcomeBPool.getAndRequireEquals();
    const volume = this.totalVolume.getAndRequireEquals();

    const k = poolA.mul(poolB);
    const newPoolA = poolA.add(amountIn);
    const newPoolB = k.divMod(newPoolA).quotient;
    newPoolB.assertGreaterThan(UInt64.zero);

    this.outcomeAPool.set(newPoolA);
    this.outcomeBPool.set(newPoolB);
    this.totalVolume.set(volume.add(amountIn));

    this.emitEvent(
      "trade",
      new TradeEvent({ outcomeIndex: Field(1), amountIn, outcomeAPool: newPoolA, outcomeBPool: newPoolB }),
    );
  }
}
