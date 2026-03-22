type AnyRecord = Record<string, unknown>;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g;
const AWS_KEY_PATTERN = /\bAKIA[0-9A-Z]{16}\b/g;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9]{16,}\b/g;
const GITHUB_TOKEN_PATTERN = /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g;
const PHONE_PATTERN = /(^|[^\w])(\+?\d[\d().\s-]{8,}\d)(?=$|[^\w])/g;
const KEY_VALUE_PATTERN =
  /(["']?)(password|passwd|pwd|token|access[_-]?token|accessToken|refresh[_-]?token|refreshToken|auth[_-]?token|authToken|api[_-]?key|apiKey|apikey|secret[_-]?key|secretKey|client[_-]?secret|clientSecret)\1(\s*[:=]\s*["']?)([^"'\s,;&}]+)/gi;

function replacementLabel(key: string): string {
  const normalized = key.toLowerCase();

  if (/(password|passwd|pwd)/.test(normalized)) return "password";
  if (/token/.test(normalized)) return "token";
  return "api_key";
}

function isSensitiveObjectKey(key: string): string | null {
  if (/^(password|passwd|pwd)$/i.test(key)) return "password";
  if (/^(token|access_token|accessToken|refresh_token|refreshToken|auth_token|authToken)$/i.test(key)) {
    return "token";
  }
  if (/^(api_key|apiKey|apikey|secret_key|secretKey|client_secret|clientSecret)$/i.test(key)) {
    return "api_key";
  }
  return null;
}

function redactPhoneNumbers(input: string): string {
  return input.replace(PHONE_PATTERN, (match, prefix: string, phone: string) => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      return match;
    }
    return `${prefix}[REDACTED:phone]`;
  });
}

export function redactSensitiveText(input: string): string {
  let output = input;

  output = output.replace(KEY_VALUE_PATTERN, (_match, quote: string, key: string, separator: string) => {
    const label = replacementLabel(key);
    return `${quote}${key}${quote}${separator}[REDACTED:${label}]`;
  });

  output = output.replace(EMAIL_PATTERN, "[REDACTED:email]");
  output = redactPhoneNumbers(output);
  output = output.replace(JWT_PATTERN, "[REDACTED:token]");
  output = output.replace(GITHUB_TOKEN_PATTERN, "[REDACTED:token]");
  output = output.replace(OPENAI_KEY_PATTERN, "[REDACTED:api_key]");
  output = output.replace(AWS_KEY_PATTERN, "[REDACTED:api_key]");

  return output;
}

export function redactSensitiveData<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (typeof value === "string") {
    return redactSensitiveText(value) as T;
  }

  if (value == null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value as object)) {
    return seen.get(value as object) as T;
  }

  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const entry of value) {
      clone.push(redactSensitiveData(entry, seen));
    }
    return clone as T;
  }

  const clone: AnyRecord = {};
  seen.set(value as object, clone);

  for (const [key, entry] of Object.entries(value as AnyRecord)) {
    const label = isSensitiveObjectKey(key);
    clone[key] = label ? `[REDACTED:${label}]` : redactSensitiveData(entry, seen);
  }

  return clone as T;
}
