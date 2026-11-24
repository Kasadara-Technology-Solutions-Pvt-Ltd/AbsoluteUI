/**
 * Validation: boolean format checks (e-mail, URL, phone, IBAN, cards, identifiers, network
 * addresses, postal codes, dates, versions) and a small composable schema validator with
 * localizable, actionable field messages (docs/PLAN-HELPERS.md section 2, section 5, section 6).
 * @example
 * import { v, validate, type Infer } from '@absoluteui/helpers/validate';
 * const user = v.object({ email: v.string({ email: true }), age: v.optional(v.number({ min: 18 })) });
 * type User = Infer<typeof user>;
 * const r = validate(user, input);
 */
export * as v from './builders.js';
export {
  validate,
  createValidator,
  defaultMessages,
  type Schema,
  type OptionalSchema,
  type Infer,
  type InferShape,
  type Issue,
  type MessageCatalog,
  type ValidateOptions,
  type StringOptions,
  type NumberOptions,
  type DateOptions,
  type ObjectOptions,
  type ParseContext,
  type Outcome,
} from './schema.js';
export {
  isEmail,
  isUrl,
  isHttpUrl,
  isPhoneE164,
  isPhone,
  isIban,
  IBAN_COUNTRIES,
  isBic,
  luhnCheck,
  isCreditCard,
  cardBrand,
  isUuid,
  isUlid,
  isIpv4,
  isIpv6,
  isCidr,
  isMacAddress,
  isHexColor,
  isSlug,
  isStrongPassword,
  isPostalCode,
  POSTAL_CODE_COUNTRIES,
  isIsoDate,
  isIsoDateTime,
  isJwtShape,
  parseSemver,
  isSemver,
  compareSemver,
  isLatitude,
  isLongitude,
  isEan13,
  isIsbn,
  type EmailOptions,
  type UrlOptions,
  type CardBrand,
  type PasswordPolicy,
  type PasswordFailure,
  type PasswordCheck,
  type SemVer,
} from './formats.js';
