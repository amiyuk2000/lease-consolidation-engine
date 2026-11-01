import { Decimal, ZERO, dec, type DecimalValue } from "./decimal";
import type { OneTimeCostBreakdown, OneTimeCostInput } from "./types";

export const DEFAULT_PROFESSIONAL_FEES_PCT = 6;

/**
 * Professional fees are charged on everything except business disruption.
 * Business disruption is included only when the user supplies it.
 */
export function computeOneTimeCosts(
  input: OneTimeCostInput | undefined,
  computed: { makeGood: Decimal; doubleRunning: Decimal | null },
): OneTimeCostBreakdown {
  const i = input ?? {};
  const fitOutNetOfTi = Decimal.max(ZERO, amount(i.fitOut).minus(amount(i.tiAllowance)));
  const moving = amount(i.moving);
  const it = amount(i.it);
  const furniture = amount(i.furniture);
  const signage = amount(i.signage);
  const surrenderPremium = amount(i.surrenderPremium);
  const terminationPenalty = amount(i.terminationPenalty);
  const businessDisruption =
    i.businessDisruption === undefined || i.businessDisruption === null ? null : dec(i.businessDisruption);

  const feeBase =
    computed.doubleRunning === null
      ? null
      : computed.makeGood
          .plus(fitOutNetOfTi)
          .plus(moving)
          .plus(it)
          .plus(furniture)
          .plus(signage)
          .plus(surrenderPremium)
          .plus(terminationPenalty)
          .plus(computed.doubleRunning);
  const feesPct = dec(i.professionalFeesPct ?? DEFAULT_PROFESSIONAL_FEES_PCT);
  const professionalFees = feeBase === null ? null : feeBase.times(feesPct).dividedBy(100);
  const total =
    feeBase === null || professionalFees === null
      ? null
      : feeBase.plus(professionalFees).plus(businessDisruption ?? ZERO);

  return {
    makeGood: computed.makeGood,
    fitOutNetOfTi,
    moving,
    it,
    furniture,
    signage,
    surrenderPremium,
    terminationPenalty,
    doubleRunning: computed.doubleRunning,
    professionalFees,
    businessDisruption,
    total,
  };
}

function amount(value: DecimalValue | undefined): Decimal {
  return value === undefined ? ZERO : dec(value);
}
