import { isEnabled } from '$lib/feature_flags/get.server'

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ cookies }) {
  const bucket = cookies.get('destination_bucket')
  if (!bucket) {
    const tmp = await isEnabled('fast_payments')
    // If the feature is enabled, try bucketing users randomly
    if (tmp) cookies.set('destination_bucket', Math.random() > 0.5 ? '1' : '0', { path: '/' })
    // If the feature is disabled, do not bucket and preserve the current experience
    else cookies.set('destination_bucket', '0', { path: '/' })
  }
  const fast_payments = Boolean(Number(cookies.get('destination_bucket')))
  return {
    fast_payments,
  }
}
