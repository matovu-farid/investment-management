export async function loadLoginState(reads: { session: () => Promise<boolean>; bootstrap: () => Promise<boolean>; recovery: boolean }) {
  // If the optional setup lookup fails, leave setup closed while preserving
  // the sign-in form and the redirect for already signed-in users.
  const [signedIn, bootstrap] = await Promise.all([reads.session(), reads.bootstrap().catch(() => false)])
  return { signedIn, bootstrap: !signedIn && bootstrap, recovery: !signedIn && reads.recovery }
}
