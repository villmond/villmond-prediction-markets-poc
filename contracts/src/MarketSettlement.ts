import { Bool, Field, PublicKey, Signature, SmartContract, state, State, method, UInt64, Struct } from "o1js";

/**
 * Admin fee percentage is a hardcoded contract constant, not mutable state,
 * per PRD 5.5 ("ZK Integrity: Hardcoded state transition checks prevent
 * tampering by creators or oracles"). Mirrors config.yaml's
 * `economy.admin_fee_percentage: 2.5` (expressed in basis points).
 */
const ADMIN_FEE_BPS = 250n;
const BPS_DENOMINATOR = 10_000n;

type ResolutionEventShape = {
  winningOutcome: typeof Field;
  totalPool: typeof UInt64;
  adminFee: typeof UInt64;
  netPool: typeof UInt64;
  adminPublicKey: typeof PublicKey;
};

const ResolutionEventStruct: ReturnType<typeof Struct<ResolutionEventShape>> = Struct({
  winningOutcome: Field,
  totalPool: UInt64,
  adminFee: UInt64,
  netPool: UInt64,
  adminPublicKey: PublicKey,
});

export class ResolutionEvent extends ResolutionEventStruct {}

/**
 * Proves market resolution and the mandatory admin fee cut (PRD 5.5).
 * VILCOIN itself is an off-platform-worthless, closed-loop app credit (not
 * a native Mina asset — PRD core invariant), so this contract proves the
 * resolution + fee *calculation*; the emitted `resolved` event is the
 * tamper-evident instruction that off-chain VILCOIN balance updates
 * (signed Nostr events) must follow to credit `adminPublicKey`.
 *
 * POC simplification: resolution trusts a single oracle signature. The
 * PRD's FUNC-02 mitigation (M-of-N oracle aggregation) is out of scope here
 * and belongs in a later hardening pass.
 */
export class MarketSettlement extends SmartContract {
  @state(PublicKey) adminPublicKey = State<PublicKey>();
  @state(PublicKey) oraclePublicKey = State<PublicKey>();
  @state(Bool) resolved: State<Bool> = State<Bool>();
  @state(Field) winningOutcome: State<Field> = State<Field>();
  @state(UInt64) totalPool = State<UInt64>();
  @state(Bool) configured: State<Bool> = State<Bool>();

  events = {
    resolved: ResolutionEvent,
  };

  init() {
    super.init();
    this.resolved.set(Bool(false));
    this.winningOutcome.set(Field(0));
    this.totalPool.set(UInt64.zero);
    this.configured.set(Bool(false));
  }

  /** One-time configuration, immediately after deployment. */
  @method async configure(adminPublicKey: PublicKey, oraclePublicKey: PublicKey) {
    this.configured.getAndRequireEquals().assertFalse();

    this.adminPublicKey.set(adminPublicKey);
    this.oraclePublicKey.set(oraclePublicKey);
    this.configured.set(Bool(true));
  }

  /**
   * Resolves the market given the designated oracle's signature over
   * `[winningOutcome, totalPool, this.address]`, and proves the admin fee
   * cut. The signed message includes this contract's own address so a
   * resolution signature cannot be replayed against a different
   * MarketSettlement instance sharing the same oracle and a matching
   * outcome/pool (both realistic in a multi-market deployment).
   */
  @method async resolveMarket(oracleSignature: Signature, winningOutcome: Field, totalPool: UInt64) {
    this.resolved.getAndRequireEquals().assertFalse();

    const oraclePublicKey = this.oraclePublicKey.getAndRequireEquals();
    const adminPublicKey = this.adminPublicKey.getAndRequireEquals();
    oracleSignature
      .verify(oraclePublicKey, [winningOutcome, totalPool.value, this.address.x, this.address.isOdd.toField()])
      .assertTrue();

    const adminFee = totalPool.mul(UInt64.from(ADMIN_FEE_BPS)).divMod(UInt64.from(BPS_DENOMINATOR)).quotient;
    const netPool = totalPool.sub(adminFee);

    this.resolved.set(Bool(true));
    this.winningOutcome.set(winningOutcome);
    this.totalPool.set(totalPool);

    this.emitEvent("resolved", new ResolutionEvent({ winningOutcome, totalPool, adminFee, netPool, adminPublicKey }));
  }
}
