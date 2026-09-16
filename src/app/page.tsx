import { redirect } from 'next/navigation';
import { PROVIDER_IDS } from '@/lib/providers';

/**
 * The root has no dashboard of its own — there is no meaningful "both agents"
 * view, because the two are priced by different vendors and one of them is not
 * a real charge at all. Land on the first agent instead.
 */
export default function RootPage() {
  redirect(`/${PROVIDER_IDS[0]}`);
}
