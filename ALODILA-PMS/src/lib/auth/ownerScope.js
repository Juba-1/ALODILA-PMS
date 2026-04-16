import { ownerCrmIdFromUser } from './roles'
import { supabase } from '../supabase/client'

/**
 * Defense-in-depth: every owner-portal DB read must use an `ownerCrmId` that matches
 * the signed-in user's JWT (`user_metadata` / `app_metadata`). RLS (`current_owner_id()`)
 * is authoritative; this rejects tampered React context before hitting the network.
 */
export async function assertOwnerCrmIdMatchesSession(ownerCrmId) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const id = String(ownerCrmId || '').trim()
  if (!id) throw new Error('Owner scope: owner CRM id is required.')

  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  const fromJwt = ownerCrmIdFromUser(data?.user)
  if (!fromJwt || fromJwt !== id) {
    throw new Error('Owner scope mismatch: session does not authorize this owner CRM id.')
  }
}
