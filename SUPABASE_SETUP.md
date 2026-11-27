# Secret message box setup

The secret box encrypts recipient messages in the browser, then stores the ciphertext in Supabase so the wish creator can read them from another device. The recipient wish link allows submitting messages; a separate private inbox link is required to decrypt and read them.

## Configure Supabase

1. Create a Supabase project.
2. Open the SQL Editor and run [`supabase/setup.sql`](./supabase/setup.sql).
3. Copy the project URL and the **anon/public or publishable** key from the project API settings into [`assets/wishbox-config.js`](./assets/wishbox-config.js).

Only the anon/public or publishable key belongs in the static site. Never put a Supabase service-role or secret key in the repository or browser code.

The database denies direct table access. Its RPC functions allow anyone with a wish link to submit up to 50 encrypted messages of at most 1,000 plaintext characters. The recipient link contains only the public encryption key; the private decryption key is kept in the creator's private inbox link.

## Share safely

In the editor, choose **Copy share link** for the recipient and **Copy private inbox link** for yourself. Keep the private inbox link secret: anyone who has it can read that wish's messages. The private key is also kept in this browser's local storage, but save the private inbox link somewhere safe in case you switch devices or clear browser data.

Messages are encrypted before leaving the recipient's browser; Supabase stores only encrypted message contents. Messages remain stored until the Supabase project or its message rows are removed. Anyone with the recipient wish link can submit a message; the page cannot verify a person's identity from a public link alone.

After adding the Supabase values, update the `secret-box-1` cache version in `assets/secret-box.js` when changing `assets/wishbox-config.js`, so browsers load the new public config.
