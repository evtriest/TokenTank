/** A quick client-side check that mirrors what server.py accepts. */

export interface TargetCheck {
  ok: boolean
  message: string
  /** True when the range is outside the private address space. */
  public: boolean
  hosts: number
  /** Normalised label for the buttons, e.g. "192.168.43.10-192.168.43.50". */
  summary: string
}

/** 512 addresses is the scanner's limit, so /23 is the widest subnet here. */
export const MAX_HOSTS = 512

function validIpv4(text: string): boolean {
  const parts = text.split('.')
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  )
}

/** 10/8, 172.16/12, 192.168/16, 127/8 and the link-local block. */
export function isPrivateAddress(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 10 ||
    a === 127 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254)
  )
}

function numeric(ip: string): number {
  return ip.split('.').reduce((total, part) => total * 256 + Number(part), 0)
}

export function checkTarget(raw: string): TargetCheck {
  const text = raw.trim()
  const fail = (message: string): TargetCheck => ({
    ok: false,
    message,
    public: false,
    hosts: 0,
    summary: text,
  })

  if (!text) return fail('Give an address, a range or a subnet.')

  if (text.includes('/')) {
    const [base, size] = text.split('/')
    if (!validIpv4(base) || !/^\d{1,2}$/.test(size)) {
      return fail('That is not a subnet. Try 192.168.43.0/24.')
    }
    const prefix = Number(size)
    if (prefix < 23 || prefix > 32) return fail('Use a /23 up to /32.')
    return {
      ok: true,
      message: '',
      public: !isPrivateAddress(base),
      hosts: 2 ** (32 - prefix),
      summary: `${base}/${prefix}`,
    }
  }

  if (text.includes('-')) {
    const [from, to] = text.split('-').map((part) => part.trim())
    if (!validIpv4(from)) return fail('A range starts with a full IPv4 address.')
    const end = validIpv4(to) ? to : `${from.split('.').slice(0, 3).join('.')}.${to}`
    if (!validIpv4(end)) return fail('That is not a range. Try 192.168.43.10-50.')
    const hosts = numeric(end) - numeric(from) + 1
    if (hosts <= 0) return fail('The end of the range comes before the start.')
    if (hosts > MAX_HOSTS) return fail(`${hosts} addresses is more than the ${MAX_HOSTS} the scanner allows.`)
    return {
      ok: true,
      message: '',
      public: !isPrivateAddress(from),
      hosts,
      summary: `${from}-${end}`,
    }
  }

  if (!validIpv4(text)) return fail('That is not an IPv4 address.')
  return {
    ok: true,
    message: '',
    public: !isPrivateAddress(text),
    hosts: 1,
    summary: text,
  }
}
