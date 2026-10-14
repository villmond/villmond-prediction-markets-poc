Feature: Market settlement and admin fee enforcement
  The Mina zkApp must prove market resolution and the mandatory admin fee
  cut on every settlement, and must reject tampering by non-oracles or
  repeated resolution (PRD 5.5).

  Background:
    Given a deployed market settlement contract with a designated admin and oracle

  Scenario: The designated oracle resolves a market and the admin fee is proven
    When the oracle resolves the market with a total pool of 10000 VILCOIN and winning outcome 0
    Then the market is marked resolved
    And the proven admin fee is 250 VILCOIN

  Scenario: A non-designated key cannot resolve the market
    When an impostor tries to resolve the market with a total pool of 5000 VILCOIN and winning outcome 1
    Then the resolution attempt is rejected

  Scenario: A resolved market cannot be resolved a second time
    Given the oracle has already resolved the market with a total pool of 10000 VILCOIN and winning outcome 0
    When the oracle tries to resolve the market again with a total pool of 1 VILCOIN and winning outcome 1
    Then the resolution attempt is rejected
