import { registerDecorator } from 'class-validator';
import type { ValidationOptions } from 'class-validator';
import disposableDomains from 'disposable-email-domains';

/**
 * Blocks known throwaway-email domains (mailinator.com and its ~120k
 * siblings, from the `disposable-email-domains` list) at registration.
 *
 * Deliberately narrow: this checks the domain against a maintained denylist,
 * not any heuristic about whether the local part "looks generated" — that
 * kind of pattern match is exactly the sort of thing that starts rejecting
 * real people's real addresses.
 */
const DISPOSABLE_DOMAINS = new Set(disposableDomains.map((domain) => domain.toLowerCase()));

export function IsNotDisposableEmail(validationOptions?: ValidationOptions) {
  return function decorate(object: object, propertyName: string) {
    registerDecorator({
      name: 'isNotDisposableEmail',
      target: object.constructor,
      propertyName,
      options: {
        message: 'Please use a permanent email address — disposable addresses are not accepted.',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return true; // @IsEmail() reports the shape problem
          const domain = value.split('@').at(-1)?.toLowerCase().trim();
          return !domain || !DISPOSABLE_DOMAINS.has(domain);
        },
      },
    });
  };
}
