Feature: Oracle reputation aggregation
  Users publish ratings over Nostr targeting oracle public keys, and the
  client computes an aggregated reliability score used to gate oracle
  eligibility (PRD 5.4, config.yaml oracles.min_reputation_threshold).

  Scenario: An oracle's reputation is the average of distinct raters' scores
    Given an oracle has received a score of 5 from "alice"
    And the same oracle has received a score of 3 from "bob"
    And the same oracle has received a score of 4 from "carol"
    When the oracle's reputation is computed
    Then the average score is 4
    And the oracle meets the configured minimum reputation threshold

  Scenario: A rater's repeated rating only counts once, using the latest
    Given an oracle has received a score of 1 from "alice"
    And the same oracle later receives a score of 5 from "alice"
    When the oracle's reputation is computed
    Then the average score is 5
    And the rating count is 1

  Scenario: An oracle with no ratings does not meet the reputation threshold
    Given an oracle has received no ratings
    When the oracle's reputation is computed
    Then the oracle does not meet the configured minimum reputation threshold
