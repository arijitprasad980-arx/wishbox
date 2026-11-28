# Secret message box setup

The secret box encrypts recipient messages in the browser, then stores the ciphertext in Supabase so the wish creator can read them from another device. The recipient wish link allows submitting messages; a separate private inbox link is required to decrypt and read them.

After the recipient taps the cake, the candle and confetti animation plays and the wish appears. Closing the wish opens a simple secret-message form. A successful send stores the encrypted message and closes the form.

## Configure Supabase

1. Create a Supabase project.
2. Open the SQL Editor and run [`supabase/setup.sql`](./supabase/setup.sql). If the secret-message tables are already set up, run the updated script again to add short-link storage and its RPC functions.
3. Copy the project URL and the **anon/public or publishable** key from the project API settings into [`assets/wishbox-config.js`](./assets/wishbox-config.js).

Only the anon/public or publishable key belongs in the static site. Never put a Supabase service-role or secret key in the repository or browser code.

The database denies direct table access. Its RPC functions allow anyone with a wish link to submit up to 50 encrypted messages of at most 1,000 plaintext characters. The recipient link contains only the public encryption key; the private decryption key is kept in the creator's private inbox link.

## Share safely

In the editor, choose **Copy short link** for the recipient. Each wish gets its own short link; its content is stored in Supabase so photos and other elements do not make the URL huge. **Copy full link** remains available as a self-contained alternative. Short links need the Supabase setup above. Choose **Copy private inbox link** for yourself and keep it secret: anyone who has it can read that wish's messages. The private key is also kept in this browser's local storage, but save the private inbox link somewhere safe in case you switch devices or clear browser data.

Each wish has its own short link, secret-message box, and matching private inbox link. Editing a wish from the browser where its short link was created updates that link. Sending the same wish link to multiple people sends all their replies to that wish's inbox; creating a separate wish creates a separate inbox and short link.

Messages are encrypted before leaving the recipient's browser; Supabase stores only encrypted message contents. Messages remain stored until the Supabase project or its message rows are removed. Anyone with the recipient wish link can submit a message; the page cannot verify a person's identity from a public link alone.

After adding the Supabase values, update the `secret-box-1` cache version in `assets/secret-box.js` when changing `assets/wishbox-config.js`, so browsers load the new public config.
