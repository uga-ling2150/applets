# Cloudflare guide for LING2150

Hi Ryan,

This guide explains how Cloudflare supports Activities 5C, 7A and 7B. It also explains how to use the activities, update them, and move their services to your own Cloudflare account.

The activities are already online. You do not need a Cloudflare account to use them in class. For 7A, use your GitHub account, `kayaulai`, to view the teacher tools. Students do not need accounts.

Moving the services is a one-time setup. You can reuse the existing code. You do not need to write a new app or train an AI model. The move does require new account settings, private keys and service addresses. Section 5 gives the steps in order.

## 1. What Cloudflare does

Each activity has two parts:

- **Frontend:** the page students see and use. GitHub Pages publishes these pages from this repository.
- **Backend:** the service that works behind the page. Cloudflare runs this part. It receives requests from the page and returns a result, such as an AI reply or a saved submission.

A **Cloudflare Worker** is a small program that runs on Cloudflare's computers. **Workers AI** runs the language model. **Durable Objects** keep information between requests. Here, they use Cloudflare's SQLite-backed storage. SQLite is a way to store data; you do not need to install a separate database server.

| Activity | What Cloudflare does | What its storage keeps |
| --- | --- | --- |
| **5C: Explicature and Query Rewriting** | Runs AI to rewrite a selected Human turn using the earlier conversation. | Request counts and temporary records of requests in progress. It does not save the conversation in this storage. |
| **7A: Backchannel Locations** | Saves classroom attempts, checks teacher sign-in, provides downloads, and shares class comparisons when the teacher chooses. It does not use AI. | Anonymous participant numbers, click times, attempts, task actions and submission times. Classroom records expire after 30 days. |
| **7B: Presumptive Grounding** | Runs the same AI model with two different sets of instructions. One encourages an answer based on an interpretation. The other encourages a question when the meaning is unclear. | Request counts and temporary records of requests in progress. It does not save transcripts in this storage. |

5C and 7B use **Llama 3.1 8B Instruct Fast**. The model runs on Cloudflare, so students do not download it. Their conversation text is sent to the model when they ask for a reply. Their private notes and reflections are not sent. Use fictional examples rather than personal information.

The public GitHub repository holds the code. It does not hold 7A classroom submissions or private service keys.

## 2. How to use the three activities

### 5C: Rewrite a message so it makes sense on its own

[Open Activity 5C](https://uga-ling2150.github.io/applets/week_5/5C_explicit_query_rewriting.html)

For example, after “I am choosing between a red bag and a blue bag,” the reply “The blue one” could become “I choose the blue bag.” The task is to make the meaning clear, not to answer the message.

1. Load the example or write both sides of a conversation.
2. Select **Practice human turns**.
3. Write your own version of the selected Human turn. It should make sense without the earlier conversation.
4. Select **Show model rewrite**. Cloudflare receives that turn and its earlier context, then returns the model's version.
5. Compare the two versions. Choose a judgment and explain it.
6. Select **Save reflection & continue**. Use **Download my work** before closing the tab.

The model's version is not an answer key. It may leave out useful context or add an unsupported interpretation. The activity does not automatically send students' written work to a teacher dashboard. If you want to collect it, ask students to submit their downloaded work through your usual course system.

### 7A: Mark where you would respond while listening

[Open Activity 7A](https://uga-ling2150.github.io/applets/week_7/7A_backchannel_locations.html)

A **backchannel** is a short response, such as “mm-hmm” or “yeah,” that shows you are listening without taking over the conversation.

For students:

1. Choose the recording you specify. Both recordings are available: **A user-friendly remote control** (about 2:46) and **Remote-control design preferences** (about 2:28).
2. Use headphones and select **Start listening**.
3. Select **I would respond here** each time you would give a short response.
4. Listen to the end. The completed attempt is submitted automatically. The student's clicks also appear on a timeline.
5. Open **My records & downloads** to check the receipt or download personal results. A receipt is a reference that helps locate an attempt.

For you:

1. Open **For teachers: view and download results**.
2. Select **Sign in with GitHub** and use `kayaulai`.
3. Select **View / refresh results** to check submissions.
4. Use **Download all attempts (CSV)** and **Download activity log (CSV)** to save records. A CSV file is a table that can be opened in Excel.
5. Select **Share comparison with class** when you want students to compare their click patterns. The comparison uses each participant's first completed attempt. The teacher download includes all attempts.

The page creates a shared **collection**, meaning one set of classroom records, automatically. You do not need to create a room or give students a code. Each recording has its own collection. Ask the class to choose the same recording.

Use **Start next collection** only when you want a fresh set of records for a later class. Earlier collections remain available until they expire. Download records within 30 days. Each collection supports up to 60 browser participants.

Participant numbers identify browser records, not verified students. Clearing browser storage or switching devices can create a new participant. No student names or emails are collected. If a student gives you a receipt, you can use it to find that attempt. Written reflections and students' voices are not uploaded as classroom records.

To test the student view while you are signed in as a teacher, use a separate browser or private window.

### 7B: Compare an assumption with a clarification question

[Open Activity 7B](https://uga-ling2150.github.io/applets/week_7/7B_presumptive_grounding.html)

This activity explores **common ground**, meaning the understanding that conversation partners share. A reply can sound clear even when the speaker has misunderstood the message.

1. Choose a scenario. With a partner, decide what you mean.
2. Write one opening message and select **Start both conversations**.
3. Read both replies. Assistant A is instructed to proceed with an interpretation. Assistant B is instructed to ask when the meaning is unclear.
4. Continue each conversation separately. Answer questions or correct misunderstandings.
5. Mark useful examples, write your comparison, and select **Download my work** before leaving.

Both assistants use the same model. Their instructions differ, but their behavior is not guaranteed. Either one may give an unhelpful reply. Private notes about your intended meaning and written reflections stay in the browser tab.

This activity does not submit student work to the instructor. Collect downloaded work separately if needed. If the live AI is unavailable, use **Offline discussion example (scripted, not live AI)**. That example is written in advance; it is not a new model response.

## 3. Where the code and settings are

### GitHub

The repository is [uga-ling2150/applets](https://github.com/uga-ling2150/applets).

The GitHub Pages settings were checked for this handover. The site publishes from the **main** branch and the **/docs** folder. A branch is a version of the repository; `main` is the version used for publication.

| Activity | Main page | Frontend files | Backend folder |
| --- | --- | --- | --- |
| 5C | `docs/week_5/5C_explicit_query_rewriting.html` | `docs/week_5/5c/` | `services/query-rewrite/` |
| 7A | `docs/week_7/7A_backchannel_locations.html` | `docs/week_7/7a/` | `services/backchannel-locations/` |
| 7B | `docs/week_7/7B_presumptive_grounding.html` | `docs/week_7/7b/` | `services/presumptive-grounding/` |

### Cloudflare

The current Worker addresses are:

| Activity | Worker name | Service address |
| --- | --- | --- |
| 5C | `ling2150-query-rewrite` | `https://ling2150-query-rewrite.ling2150-query-rewrite.workers.dev` |
| 7A | `ling2150-7a-classroom` | `https://ling2150-7a-classroom.ling2150-query-rewrite.workers.dev` |
| 7B | `ling2150-7b-grounding` | `https://ling2150-7b-grounding.ling2150-query-rewrite.workers.dev` |

The existing service notes describe a Cloudflare Free plan. The current account owner, billing settings and remaining allowance were not checked for this handover. The address ending in `workers.dev` is a public service address, not an account login.

Each backend folder contains `wrangler.jsonc`. This file tells Cloudflare the Worker name, storage connections and other settings. **Wrangler** is Cloudflare's command-line tool for sending code to Cloudflare. **Deploy** means publish that code so the service can run online.

The files already define the required storage. You do not need to create a separate D1 database or write database tables. Keep the existing `durable_objects` and `migrations` sections. The migration section tells Cloudflare how to create the storage for these programs.

These private values must be set separately:

| Service | Secret name | Purpose |
| --- | --- | --- |
| 5C | `SESSION_SECRET` | Signs temporary browser sessions so the backend can check them. |
| 7B | `SESSION_SECRET` | Does the same for 7B. Use a different value from 5C. |
| 7A | `GITHUB_CLIENT_SECRET` | Lets the backend complete GitHub teacher sign-in. |

A **secret** is a private value stored in Cloudflare. Do not put it in GitHub, HTML, this guide or Freedcamp. Existing secret values are not needed for a fresh installation; create new ones in your own account.

7A uses **GitHub OAuth**, a sign-in process that lets the app check a teacher's GitHub identity without receiving the teacher's password. Its existing OAuth app is documented as owned by `yan2li3`. Ryan's allowed GitHub ID is `43101723`; the developer/reviewer ID is `316212992`. These fixed numbers are checked instead of usernames.

Teacher access and service ownership are separate. Signing in to 7A as a teacher does not give access to the Cloudflare account.

## 4. How to update the existing apps

### Change page text or layout

1. Open the relevant file in GitHub and select **Edit**.
2. Make the change and select **Commit changes**. A commit is a saved change in the repository.
3. Save to `main`, or merge the reviewed change into `main` if using a separate branch.
4. Check the repository's **Actions** page. Wait for **pages build and deployment** to finish successfully.
5. Open the published activity and check the change. Refresh the browser if it still shows the old version.

The shared page style is in `docs/style.css`. Follow [conventions.md](conventions.md) when changing layout.

### Change backend behavior

Edit the matching file under `services/`, run its tests, and deploy that Worker. The command blocks in Section 5 also show how to test and deploy. For a routine update, keep the existing account settings and secrets. Do not generate new secrets each time.

**A GitHub commit publishes the frontend through Pages. It does not deploy the Cloudflare backend under the documented setup.** Backend changes need a separate Wrangler deployment.

7B also has a copy of the page served by its Worker. Run `npm run build` before deploying 7B so that copy includes the latest page changes.

5C and 7B have an `ENABLED` setting in `wrangler.jsonc`. Set it to `"false"` and deploy to pause AI requests. Set it to `"true"` and deploy to resume them. 7A does not use this setting.

## 5. Move the services to your own Cloudflare account

This section keeps the same GitHub repository and student page links. Only the backend account changes. You will need to sign in to your own accounts, enter the new private values, and complete the steps below. Creating a Cloudflare account alone does not move the running services or saved records.

### Step 1: Save classroom records and choose a time

Choose a time when students are not using the activities. In 7A, download the records you want to keep for each recording and each relevant collection.

Deploying the code to a new account does **not** copy the old records. The new service starts with separate storage. Downloads provide an archive, but this project does not document a way to restore that archive into the new online teacher dashboard. Old receipts and teacher sessions should not be expected to work in the new service.

Keep the old service available during the move. Do not delete it before the new service has passed the checks in Section 6.

### Step 2: Prepare your account and computer

1. Create your account at [Cloudflare](https://dash.cloudflare.com/). Start with the Free plan. Check that Workers AI and SQLite Durable Objects are available in the account.
2. In Cloudflare, find your **Account ID** and copy it. It identifies the destination account; it is not a password. Workers & Pages may also ask you to choose a `workers.dev` subdomain. This becomes part of your new service addresses.
3. Install the supported **Node.js LTS** version from [nodejs.org](https://nodejs.org/). Node.js runs the project's setup tools. It includes `npm` and `npx`, which install or run those tools.
4. In GitHub, open this repository, select **Code → Download ZIP**, and unzip it on your computer. Use a fresh copy for the move. You can also clone the repository if you already use Git.
5. Open a terminal in the unzipped `applets-main` folder. A terminal lets you run the commands below. On Windows, use PowerShell; on macOS, use Terminal. The commands assume you start in this folder.

Run:

```sh
node --version
npm --version
npx wrangler login
npx wrangler whoami
```

The login command opens a browser. Sign in to the new Cloudflare account. Check that `whoami` shows the intended account before continuing.

Open the three `wrangler.jsonc` files listed in Section 3. In each file, add this top-level setting after the opening `{`, replacing the example text with your actual Account ID:

```json
"account_id": "YOUR_CLOUDFLARE_ACCOUNT_ID",
```

Keep the existing Worker names and storage settings. In the 5C and 7B files, change `"ENABLED": "true"` to `"ENABLED": "false"` for the first deployment. This keeps AI requests paused while you finish setup.

### Step 3: Set up 5C

Run these commands from the repository folder:

```sh
cd services/query-rewrite
npm install --global pnpm
pnpm install --frozen-lockfile
pnpm test
pnpm exec wrangler deploy
```

`pnpm` is the package tool already used by this service. The tests check the code with simulated model responses. Stop and resolve any failed test or deployment before continuing.

Copy the Worker URL printed after deployment. This is your **new 5C address**.

Generate a private random value:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
pnpm exec wrangler secret put SESSION_SECRET
```

Paste the generated value when Wrangler asks for the secret. Keep it private. In `wrangler.jsonc`, set `ENABLED` to `"true"`, then run:

```sh
pnpm exec wrangler deploy
cd ../..
```

### Step 4: Set up 7B

Run from the repository folder:

```sh
cd services/presumptive-grounding
npm install
npm test
npm run build
npx wrangler deploy
```

Copy the printed Worker URL as your **new 7B address**. Generate a new secret for this service:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npx wrangler secret put SESSION_SECRET
```

Paste this new value when asked. Set `ENABLED` to `"true"` in this service's `wrangler.jsonc`, then run:

```sh
npx wrangler deploy
cd ../..
```

Step 6 below rebuilds the Worker page with its new address. Until then, that copy of the page still contains the old API address.

### Step 5: Set up 7A and your teacher sign-in

Run from the repository folder:

```sh
node --test services/backchannel-locations/tests/core.test.cjs services/backchannel-locations/tests/frontend.test.cjs services/backchannel-locations/tests/roles.test.cjs services/backchannel-locations/tests/classroom.test.mjs
npx wrangler deploy --config services/backchannel-locations/wrangler.jsonc
```

Copy the printed Worker URL as your **new 7A address**. Teacher sign-in will not work until you finish the following setup.

While signed in to your GitHub account, open **Settings → Developer settings → OAuth Apps → New OAuth App**. Create a new app for this service using:

| Field | Value |
| --- | --- |
| Application name | `LING2150 7A Teacher Sign-in` |
| Homepage URL | `https://uga-ling2150.github.io/applets/week_7/7A_backchannel_locations.html` |
| Authorization callback URL | Your new 7A Worker address followed by `/api/teacher/callback` |

The **callback URL** is where GitHub returns the user after sign-in. For example, if the new address is `https://ling2150-7a-classroom.example.workers.dev`, the callback is `https://ling2150-7a-classroom.example.workers.dev/api/teacher/callback`. Replace the example with the actual address.

After registering the app, copy its **Client ID** and generate a **Client Secret**. The ID is public configuration. The secret must stay private. Creating your own OAuth app leaves the old sign-in service available during the move.

In `services/backchannel-locations/wrangler.jsonc`:

- Replace `GITHUB_CLIENT_ID` with your new app's Client ID.
- Keep `43101723` in `GITHUB_TEACHER_IDS` for your `kayaulai` account. Keep `316212992` only if you still want the developer/reviewer to have teacher access. For your access alone, set the value to `"43101723"`.

Then run from the repository folder:

```sh
npx wrangler secret put GITHUB_CLIENT_SECRET --config services/backchannel-locations/wrangler.jsonc
npx wrangler deploy --config services/backchannel-locations/wrangler.jsonc
```

Enter the new OAuth Client Secret when asked. Do not enter your GitHub password as this secret.

### Step 6: Connect the pages to the new services

An **API address** is the address a page uses to reach its backend. Replace the old addresses in these three files with the new ones. Use the address without a final `/`.

| File | Setting to change |
| --- | --- |
| `docs/week_5/5c/config.js` | `apiBase` → new 5C address |
| `docs/week_7/7a/classroom.js` | `API` → new 7A address |
| `docs/week_7/7b/applet.js` | `API` → new 7B address |

Leave the student GitHub Pages URLs unchanged. The existing allowed website settings still apply because the pages remain on `https://uga-ling2150.github.io`.

Rebuild and deploy the 7B mirror from your local copy:

```sh
cd services/presumptive-grounding
npm run build
npx wrangler deploy
cd ../..
```

Before publishing the frontend changes, run the health checks in Section 6 against the new addresses. Then save the three changed frontend files and three changed `wrangler.jsonc` files to this repository's `main` branch. You can use GitHub's file editor or **Add file → Upload files** in the correct folder. Preserve the paths in the tables above. Upload only those intended files, not the whole local folder, installed packages or secret files.

Wait for GitHub Pages to finish publishing. Complete the activity checks in Section 6, including your own GitHub sign-in. If a check fails, restore the previous three frontend API addresses and publish them while you fix the new service. This reconnects the pages to the old service if it is still available.

After all checks pass, update the address table in this guide. Record which account holds the old 7A records. Keep any needed exports in your usual private course storage, outside this public repository.

## 6. How to confirm the setup works

### First, check that each service responds

A **health check** is a small request that asks whether the service is reachable. It does not run the AI or create a student attempt.

For 7A, open the new Worker address followed by `/api/health`. It should show `"ok":true`.

For 7B, open the new Worker address followed by `/api/health`. It should show `"enabled":true` and the model name.

5C checks which website sent the request, so use this command with the actual new 5C address:

```sh
curl -H "Origin: https://uga-ling2150.github.io" "https://YOUR-5C-WORKER.workers.dev/health"
```

On Windows PowerShell, use `curl.exe` instead of `curl`. Expect `"enabled":true` and the model name. Opening this URL directly in a browser can return `origin_not_allowed`; that alone does not mean the deployment failed.

The three existing service health checks passed during the September 23, 2026 review. A health check does not prove that AI replies, sign-in or data saving work. After a move or backend change, also complete the checks below.

### Then, check the full activity

| Activity | Check | Success means |
| --- | --- | --- |
| 5C | Open the published page, write a rewrite, and select **Show model rewrite**. Download your work. | An actual model rewrite appears, and the download contains your work. |
| 7A student | Choose a recording, mark a few points, listen to the end, and refresh. | The completed attempt has a receipt and remains visible after refresh. |
| 7A teacher | Sign in as `kayaulai`, find the test attempt, and download the CSV. Share the comparison. | The record appears in the teacher view and download. A separate unsigned-in browser can see the released comparison. |
| 7A recordings | Check each recording separately. | Records stay with the selected recording. |
| 7B | Send an opening message to both assistants and continue each conversation. Download the result. | Both assistants return replies, and the download contains the conversations and reflection. |

Use fictional test content. AI checks use some of the account's allowance. Before a large class, also try the pages on the intended classroom network.

## 7. Common problems and what to check

| Problem | What to do |
| --- | --- |
| The page opens, but AI or saving does not work. | The page and backend are separate. Check the API address in the frontend file, then check that Worker in Cloudflare. |
| The new page still calls the old service. | Confirm that the changed file is on `main`, wait for Pages publication, and refresh. For the 7B Worker copy, rebuild and deploy it as well. |
| 5C or 7B says the service is unavailable. | Check `ENABLED`, the `SESSION_SECRET`, and the `AI` and `CLASSROOM` connections in the Worker configuration. Also check Workers AI usage and model availability. |
| A request limit has been reached. | Check the app's daily/session limits and the Cloudflare account's remaining allowance. Do not repeatedly resend the same request. 7B has an offline discussion example. |
| A reply takes too long. | Wait briefly and retry manually. The backend stops waiting after about 25 seconds; the page allows about 30 seconds. Keep or download existing work before leaving. |
| 7A teacher sign-in fails. | Check the OAuth callback address, Client ID and Client Secret. Confirm that `43101723` is in the teacher list. Sign in again if the session has expired. |
| A 7A attempt is missing. | Check the recording, selected collection, completion and submission status, and the 30-day expiry. Check whether the student changed browsers or cleared storage. |
| Students cannot see the class comparison. | Select **Share comparison with class** for the same recording and collection. Then refresh the student view. |
| A downloaded HTML copy fails while the course link works. | Use the official course link. A local file is a different browser origin, and each backend has its own rules about which origins it accepts. |
| Code changed in GitHub, but backend behavior did not change. | Deploy the corresponding Worker. A GitHub Pages update alone does not publish backend code. |

The configured daily AI request limits are 360 for 5C and 1,200 for 7B. These are limits set by the apps. They do not guarantee that the account's free AI allowance covers that many calls. Both activities may share the account allowance. Check Cloudflare usage before class. If capacity is insufficient, pause AI with `ENABLED` set to `"false"` rather than assuming a paid upgrade is required.

If you need help, record the activity URL, approximate time, exact error message and what you were doing. Also note whether you used the course page or a downloaded copy. Do not include private keys or student records in a public issue.

## Reference files

The service READMEs contain more detailed implementation and past test notes:

- [5C service README](services/query-rewrite/README.md)
- [7A service README](services/backchannel-locations/README.md)
- [7B service README](services/presumptive-grounding/README.md)

Official setup references: [Wrangler installation](https://developers.cloudflare.com/workers/wrangler/install-and-update/), [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/), and [creating a GitHub OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).

This handover documents the existing setup and the steps for a future move. It does not mean the services have already been moved to Ryan's account. GitHub Pages settings were verified while preparing the guide. A full migration and a new end-to-end classroom test have not been performed.
