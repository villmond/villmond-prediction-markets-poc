Feature: Market payout computation
  Winners of a resolved market are paid proportionally to their stake, minus
  the platform admin fee (PRD 5.5), as a signed off-chain kind:7002 record
  the resolving oracle publishes alongside the on-chain resolution.

  Scenario: Winners split the net pool proportionally to their stake
    Given a bet of 3000 VILCOIN on outcome 0 from "alice"
    And a bet of 1000 VILCOIN on outcome 0 from "bob"
    And a bet of 2000 VILCOIN on outcome 1 from "carol"
    When the market resolves with winning outcome 0 and a total pool of 10000 VILCOIN
    Then "alice" receives a payout of 7312 VILCOIN
    And "bob" receives a payout of 2437 VILCOIN
    And "carol" receives no payout

  Scenario: A bettor's repeated stakes on the winning outcome are combined
    Given a bet of 500 VILCOIN on outcome 0 from "alice"
    And another bet of 500 VILCOIN on outcome 0 from "alice"
    When the market resolves with winning outcome 0 and a total pool of 1000 VILCOIN
    Then "alice" receives a payout of 975 VILCOIN

  Scenario: No stake on the winning outcome means no payout is published
    Given a bet of 500 VILCOIN on outcome 1 from "dave"
    When the market resolves with winning outcome 0 and a total pool of 500 VILCOIN
    Then no payout is computed
