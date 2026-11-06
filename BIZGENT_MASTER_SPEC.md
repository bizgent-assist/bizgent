# BIZGENT — MASTER PROJECT SPECIFICATION

**Project:** Bizgent  
**Tagline:** Your business. Powered by intelligence.  
**Positioning:** Autonomous business financial operations with human-controlled money.  
**Hackathon:** NEAR Hackathon 2026 — Build Beyond Boundaries  
**Primary category:** Autonomous Business  
**Target submission:** November 14, 2026

---

# 1. Product vision

Bizgent is an AI-powered business financial operations platform that helps businesses plan expenses, manage their treasury and execute authorised financial transactions.

A business owner should be able to communicate naturally with an AI business agent, explain what needs to be paid, ask questions about expenses, review financial activity and delegate permitted financial operations.

Bizgent should be capable of understanding instructions such as:

- Pay our monthly software subscription of 15 USDC.
- How much have we spent on subscriptions this month?
- Show me all outstanding expenses.
- Can we afford to pay this invoice?
- Notify me when our daily spending reaches 80% of its limit.
- Pay this supplier, but ask me for approval first.

The AI interprets instructions and prepares financial actions. The backend validates them. The smart contract enforces the business's permissions and spending policies. The owner retains control over the funds.

**Core principle: The AI can make financial decisions within granted permissions, but it must never have unrestricted control over business funds.**

Bizgent is not intended to be a complete ERP, accounting package or conventional payment gateway. Its primary focus is intelligent business financial operations.

# 2. Target users

Initial target users:

- Small and medium-sized businesses.
- Freelancers and independent professionals.
- Startup founders.
- Business owners managing recurring expenses.
- Businesses that want to automate routine payments while retaining financial oversight.

The platform should be designed for international use, with Nigeria as one of its potential markets.

# 3. Core product functionality

## 3.1 Business accounts

Users can:

- Register and log in.
- Create a business.
- Set their business name and basic details.
- Invite or add business members in a future expansion.
- Access their business dashboard.
- Manage their financial preferences.

For the MVP, one user can own and manage one or more business workspaces, but the initial user interface can focus on one active business at a time.

## 3.2 Business treasury

Each business has its own logically segregated treasury.

The primary treasury asset is native USDC on NEAR mainnet.

Requirements:

- Display the business's USDC balance.
- Display deposit and withdrawal history.
- Support direct native USDC deposits.
- Support withdrawals authorised by the business owner.
- Display transaction status.
- Display transaction hashes and NEAR Explorer links.
- Clearly distinguish pending, successful and failed transactions.

Use integer base units for all financial calculations. Never use JavaScript floating-point arithmetic for authoritative monetary calculations.

The MVP should support direct USDC deposits first. Alternative-token deposits through NEAR Intents are a stretch feature.

## 3.3 Expense management

Businesses can register expenses manually.

Expense information:

- Expense title.
- Description.
- Amount.
- Currency.
- Category.
- Recipient or supplier.
- Due date.
- Payment status.
- Supporting invoice or document, if available.
- Creation date.

Suggested categories:

- Software subscriptions.
- Payroll.
- Utilities.
- Rent.
- Marketing.
- Suppliers.
- Operations.
- Other.

Users should be able to create, edit, delete and filter expenses.

The dashboard should show useful expense summaries and outstanding expenses.

Do not claim that an expense is paid simply because a payment proposal was created. Payment status must be updated only after the actual payment is verified.

## 3.4 AI business agent

Every business should have access to an intelligent financial assistant.

The assistant should:

- Understand natural-language instructions.
- Answer questions about business expenses.
- Explain available treasury balance.
- Summarise spending.
- Identify upcoming expenses.
- Prepare payment proposals.
- Check the business's payment policy.
- Request human approval when necessary.
- Explain why an action was approved, rejected or requires approval.

The AI must not independently bypass business policies.

It must not directly execute unrestricted transfers.

Its role is to interpret instructions and use controlled application tools.

## 3.5 Agent configuration and policies

A business owner can configure its AI agent.

Policy options:

- Daily spending budget.
- Maximum amount per transaction.
- Approved recipients.
- Whether new recipients require approval.
- Whether payments below a threshold can be automatic.
- Whether every payment requires approval.
- Agent activation or suspension.

Example policy:

- Daily spending limit: 50 USDC.
- Maximum automatic payment: 5 USDC.
- Approved recipients: registered suppliers.
- New recipients: owner approval required.
- Owner withdrawal authority: always retained.

These are illustrative values, not mandatory defaults.

The same rules must be enforced by the backend and, where applicable, the smart contract. The smart contract must remain authoritative for on-chain permissions.

## 3.6 Payment proposals and approvals

The workflow:

1. The user or AI requests a payment.
2. The AI prepares a proposal.
3. The backend validates the proposal against business rules.
4. If approval is required, Bizgent creates an approval request.
5. The owner receives an email notification through Brevo.
6. The owner opens Bizgent and reviews the payment.
7. The owner approves or rejects it.
8. The backend revalidates the request.
9. The smart contract independently checks permissions and executes an authorised transaction.
10. Bizgent verifies the resulting on-chain transaction.
11. The dashboard and transaction history are updated.
12. A confirmation notification is sent.

An email link must never execute a payment merely because it was opened.

Approval must be an explicit authenticated action.

An approval must be tied to the exact recipient, asset, amount, purpose and expiry. If any of those details change, the old approval must become invalid.

Implement idempotency to prevent duplicate payments.

## 3.7 Transaction history

Display:

- Transaction type.
- Amount.
- Asset.
- Recipient or sender.
- Business.
- Purpose.
- Status.
- Transaction hash.
- Timestamp.
- Related expense or approval, where applicable.

Include filtering by transaction type, status and date.

# 4. Currency and blockchain architecture

## 4.1 Primary asset

Native USDC on NEAR is the primary treasury and payment asset.

Do not use NEAR as the business's accounting or treasury unit.

NEAR is the underlying blockchain network and is needed for network operations.

Do not confuse native USDC with USDC.e or another bridged representation.

The official token contract must be verified against authoritative Circle and NEAR documentation before deployment.

## 4.2 Alternative deposits

The planned alternative-deposit flow uses NEAR Intents.

The flow should:

1. Identify supported assets.
2. Request a conversion quote.
3. Display estimated USDC output, fees, rate and quote expiry.
4. Allow the user to confirm.
5. Initiate the supported deposit/conversion flow.
6. Track the operation.
7. Verify successful USDC settlement on-chain.
8. Credit the business's internal vault balance only after settlement is verified.

Never credit the treasury simply because an alternative token was sent.

Handle expired quotes, failed operations, minimum-output requirements and refund scenarios.

This is a stretch feature. Direct USDC deposits take priority.

## 4.3 Smart-contract architecture

Use Rust and the official NEAR Rust SDK.

Build one central vault smart contract with separate logical vault balances for individual businesses.

Do not deploy a separate contract for every business in the MVP.

The contract must maintain separate records for:

- Business owner.
- Business USDC balance.
- Agent permissions.
- Spending policies.
- Approved recipients.
- Payment history and relevant transaction state.
- Withdrawal authority.

Although the contract may physically hold aggregated USDC tokens, one business must never be able to spend or withdraw another business's internally recorded balance.

The contract must enforce business isolation.

Owner authority must be retained for withdrawals and policy changes.

The contract must support the required NEP-141 token integration, including correct token registration and deposit/withdrawal handling.

Implement the correct NEP-141 interfaces and storage requirements. Verify all methods against the official standard and current NEAR SDK documentation rather than inventing interfaces.

## 4.4 Agent authorisation

The AI must not receive an unrestricted treasury private key.

Design an explicit delegation mechanism.

The owner must authorise an agent identity and its spending permissions.

For autonomous payments, use a properly restricted signing/delegation arrangement. Investigate NEAR function-call access keys and contract-level agent permissions.

The contract must verify the actual authorised caller and the applicable business policy.

Never store an unrestricted master private key in the application database or ordinary environment variables.

If a secure delegated signer cannot be completed safely within the hackathon timeframe, implement owner-wallet-signed execution for the demonstration and clearly distinguish it from autonomous execution. Do not fake an autonomous transaction.

# 5. Technical architecture

Use one GitHub repository (monorepo).

Recommended structure:

```text
bizgent/
│
├── client/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── utils/
│   │   └── App.jsx
│   ├── package.json
│   └── .env.example
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   │   ├── ai/
│   │   │   ├── brevo/
│   │   │   ├── near/
│   │   │   └── payments/
│   │   ├── validators/
│   │   ├── utils/
│   │   └── app.js
│   ├── package.json
│   └── .env.example
│
├── contracts/
│   └── vault/
│       ├── Cargo.toml
│       ├── src/
│       └── tests/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── SECURITY.md
│   └── DEPLOYMENT.md
│
├── HACKATHON.md
├── BIZGENT_MASTER_SPEC.md
├── README.md
└── .gitignore
```

## 5.1 Frontend

- React.
- Vite.
- Tailwind CSS.
- React Router.
- Axios.
- Lucide React.
- Context API or an appropriately lightweight state-management approach.
- NEAR-compatible wallet integration.

Use JavaScript and JSX rather than TypeScript for the application unless a specific dependency requires otherwise.

The frontend must be responsive and polished on desktop, tablet and mobile.

## 5.2 Backend

- Node.js.
- Express.
- MongoDB.
- Mongoose.
- JavaScript ES modules.
- Joi validation.
- JWT authentication using HTTP-only cookies.
- Brevo for transactional email and future WhatsApp messaging.
- AI provider abstraction.
- NEAR RPC integration.

Use API versioning:

`/api/v1`

## 5.3 AI provider

Use NEAR AI Cloud as the preferred initial runtime AI provider.

Create a provider abstraction so another provider, including Claude API, can be integrated later without rewriting the application's business logic.

The AI provider should support the structured responses and tool/function calling needed by Bizgent.

Verify the selected model's actual capabilities before depending on them.

Suggested service structure:

```text
server/src/services/ai/
├── ai.service.js
├── ai.provider.js
├── near-ai.provider.js
├── claude.provider.js
├── prompts/
│   └── business-agent.prompt.js
└── tools/
    ├── expenses.tools.js
    ├── payments.tools.js
    ├── policies.tools.js
    └── reports.tools.js
```

AI tools should be limited to controlled operations such as:

- getBusinessExpenses
- getBusinessBalance
- getAgentPolicy
- createPaymentProposal
- requestPaymentApproval
- getPaymentHistory
- getSpendingSummary

Do not expose an unrestricted `transferMoney()` AI tool.

The AI proposes actions. Backend policy validation and smart-contract enforcement determine whether they can happen.

## 5.4 Notifications

Use Brevo.

Implement a notification service with separate email and WhatsApp interfaces.

Email is required for the MVP.

WhatsApp is an additional feature if account activation, templates and integration time permit.

Never assume that a message was delivered merely because an API request was sent. Store provider response IDs and delivery status where available.

Use a verified sender and properly authenticated sending domain for production email.

# 6. Frontend pages

Build the entire frontend in Phase 1.

Required pages:

1. Landing page.
2. Registration.
3. Login.
4. Forgot password.
5. Dashboard.
6. Expenses.
7. Create/edit expense.
8. AI assistant.
9. Agent settings.
10. Payment approvals.
11. Treasury/wallet.
12. Transactions.
13. Business settings.
14. Profile settings.
15. Not-found page.

## Dashboard

Include:

- Business treasury balance.
- Total spending.
- Outstanding expenses.
- Pending approvals.
- Recent transactions.
- Spending overview.
- Upcoming expenses.
- AI assistant summary or entry point.

Use realistic but clearly identifiable mock data during frontend development.

All mock data must eventually be replaced by actual API responses.

## Design direction

The interface should feel like a serious international fintech product.

Design qualities:

- Modern.
- Professional.
- Premium.
- Clean.
- Mature.
- Trustworthy.
- Minimal but not empty.
- Excellent responsive behaviour.

Avoid generic AI-looking dashboards, excessive gradients, unnecessary glassmorphism and overcrowded layouts.

Create a coherent visual system with reusable components, consistent spacing, typography, colours, tables, forms, modals and navigation.

Use a distinctive Bizgent wordmark treatment. Do not spend excessive development time on elaborate branding.

The landing page should explain the problem, solution, how it works, key benefits and security model.

# 7. Database models

Design appropriate Mongoose models for:

- User.
- Business.
- Expense.
- Agent.
- AgentPolicy.
- Approval.
- Transaction.
- Notification.
- Wallet/Vault.
- AuditLog.

Use appropriate references, indexes, timestamps and validation.

A business's records must always be scoped to its business ID and authorised user.

Do not rely on frontend filtering for access control.

Store on-chain identifiers and transaction hashes where relevant.

Do not store sensitive wallet private keys in ordinary MongoDB documents.

# 8. Suggested API structure

Use `/api/v1`.

### Authentication

- POST `/auth/register`
- POST `/auth/login`
- POST `/auth/logout`
- POST `/auth/forgot-password`
- POST `/auth/reset-password`
- GET `/auth/me`

### Business

- POST `/businesses`
- GET `/businesses`
- GET `/businesses/:businessId`
- PATCH `/businesses/:businessId`

### Expenses

- POST `/businesses/:businessId/expenses`
- GET `/businesses/:businessId/expenses`
- GET `/businesses/:businessId/expenses/:expenseId`
- PATCH `/businesses/:businessId/expenses/:expenseId`
- DELETE `/businesses/:businessId/expenses/:expenseId`

### Agent

- GET `/businesses/:businessId/agent`
- PATCH `/businesses/:businessId/agent`
- GET `/businesses/:businessId/agent/policy`
- PATCH `/businesses/:businessId/agent/policy`
- POST `/businesses/:businessId/agent/chat`

### Approvals

- GET `/businesses/:businessId/approvals`
- GET `/businesses/:businessId/approvals/:approvalId`
- POST `/businesses/:businessId/approvals/:approvalId/approve`
- POST `/businesses/:businessId/approvals/:approvalId/reject`

### Treasury

- GET `/businesses/:businessId/treasury`
- POST `/businesses/:businessId/treasury/deposit`
- POST `/businesses/:businessId/treasury/withdraw`
- GET `/businesses/:businessId/treasury/history`

### Transactions

- GET `/businesses/:businessId/transactions`
- GET `/businesses/:businessId/transactions/:transactionId`

These are the initial API contracts. Refine them where necessary, but keep the frontend and backend consistent.

# 9. Security requirements

Security is a core feature, not an optional improvement.

Implement:

- Password hashing with bcrypt.
- HTTP-only authentication cookies.
- Appropriate SameSite and Secure cookie settings.
- CORS restricted to approved frontend origins.
- Joi validation.
- Rate limiting.
- Helmet.
- Authentication and business-level authorisation.
- Ownership checks on every business resource.
- Secure approval expiry.
- Idempotency for payment execution.
- Audit logs for financial actions.
- Strict amount and recipient validation.
- On-chain verification.
- Safe error handling.
- Secrets excluded from GitHub.
- No unrestricted AI financial authority.

A successful API response must not be treated as proof of a successful blockchain transaction.

Verify the actual on-chain outcome.

# 10. Environment and deployment

The project must support separate development and production configurations.

## Frontend deployment

Vercel:

- Repository: Bizgent monorepo.
- Root directory: `client`.
- Build command: `npm run build`.
- Output directory: `dist`.

Frontend public environment variables may include:

- `VITE_API_URL`
- `VITE_NEAR_NETWORK`
- `VITE_NEAR_RPC_URL`
- `VITE_AGENTPAY_CONTRACT`
- `VITE_USDC_CONTRACT`

Rename the contract environment variable to the final Bizgent contract name if appropriate.

Never put private keys, database credentials, AI API keys or Brevo API keys into Vite environment variables.

## Backend deployment

Render:

- Repository: same monorepo.
- Root directory: `server`.
- Build command: `npm install`.
- Start command: `npm start`.

Backend environment variables should include the required values for:

- MongoDB.
- JWT secrets.
- Brevo API credentials.
- AI provider credentials.
- NEAR network and contract configuration.
- Allowed frontend origins.
- Secure signing/delegation infrastructure, if implemented.

## Smart-contract deployment

Smart contracts are compiled to Wasm and deployed directly to NEAR.

They are not hosted on Render.

Develop and test on testnet first. Use mainnet configuration for the final controlled demonstration.

Use the same application architecture across networks, changing configuration rather than rewriting the application.

The production demonstration should use small controlled amounts and clearly communicate the experimental status of unaudited code.

# 11. Development phases

Claude Code must work in three major phases.

## PHASE 1 — COMPLETE FRONTEND

Build the entire React frontend.

Requirements:

- All pages and layouts.
- Responsive design.
- Authentication screens.
- Dashboard.
- Expense management interface.
- AI assistant interface.
- Agent and policy settings.
- Approval interface.
- Treasury and wallet interface.
- Transaction history.
- Settings.
- Reusable components.
- Consistent visual system.
- API service layer.
- Centralised route and configuration management.

Use realistic mock data only where backend functionality is not yet available.

Define the API contract before implementing API-dependent screens.

At the end:

- Run the frontend.
- Run the production build.
- Fix errors.
- Check responsiveness.
- Check navigation.
- Document all frontend API requirements.
- Do not begin the backend until the frontend is stable.

## PHASE 2 — BACKEND AND AI

Build the Express backend and connect it to the frontend.

Requirements:

- Authentication and authorisation.
- MongoDB models.
- Business management.
- Expense management.
- Agent configuration.
- Spending policies.
- AI provider abstraction.
- NEAR AI Cloud integration.
- Controlled AI tools.
- Payment proposals.
- Approval workflows.
- Brevo transactional email.
- Notification records.
- Transaction records.
- Audit logs.
- API validation.
- Error handling.
- Security controls.
- API documentation.

Build the application so that payment proposals and approval workflows can be tested before blockchain execution is integrated.

At the end:

- Connect frontend to backend.
- Remove unnecessary mock data.
- Test all important API flows.
- Test authentication and authorisation.
- Test business isolation.
- Test approval expiry and idempotency.
- Verify the selected AI model can follow the required instructions and use structured tools.
- Fix all errors.

## PHASE 3 — NEAR BLOCKCHAIN AND FINAL INTEGRATION

Build the Rust smart contract and integrate the blockchain.

Requirements:

- Compile the contract to Wasm.
- Implement logically isolated business vaults.
- Integrate native USDC using the correct NEP-141 interfaces.
- Implement deposits.
- Implement owner-authorised withdrawals.
- Implement agent registration and revocation.
- Implement spending policy enforcement.
- Implement approved-recipient checks.
- Implement payment execution.
- Implement transaction verification.
- Integrate the frontend wallet.
- Integrate backend blockchain services.
- Add NEAR Explorer links.
- Test all contract methods and important financial invariants.
- Implement NEAR Intents alternative deposits only if time permits and the core payment flow is reliable.

At the end:

- Run contract unit and integration tests.
- Deploy and test on testnet.
- Perform an end-to-end test.
- Prepare the controlled mainnet deployment.
- Verify the deployed contract and official USDC contract address.
- Configure Vercel and Render production environments.
- Complete a real, small-value mainnet demonstration only after the security checks pass.

# 12. Essential acceptance tests

Bizgent is not complete simply because its pages look good.

The following tests must pass.

### Business isolation

Business A must never spend, withdraw or read Business B's treasury or private records.

### Policy enforcement

If an agent has a 1 USDC per-transaction limit, a 2 USDC payment must not execute.

### Approved recipient

A payment to an approved recipient can proceed when all other policy conditions are satisfied.

### New recipient

A payment to an unapproved recipient must require the configured approval process.

### Agent revocation

Once an agent is revoked, it must not be able to execute further payments.

### Insufficient balance

A payment above the available business balance must fail safely.

### Duplicate prevention

Repeated requests must not execute the same payment twice.

### Approval integrity

Changing the amount or recipient after approval must invalidate the original approval.

### Blockchain verification

The application must not display a transaction as successful until its actual on-chain result has been verified.

### AI restrictions

The AI must not bypass business policy, change permissions without authorisation or execute unrestricted transfers.

# 13. Hackathon demonstration

The demonstration should tell one coherent story.

Suggested scenario:

1. A business owner opens Bizgent.
2. The business has a USDC treasury balance.
3. The owner has registered a software subscription expense.
4. The owner asks the AI assistant to pay the subscription.
5. The AI understands the request and prepares a payment proposal.
6. Bizgent checks the business policy.
7. The payment is either automatically authorised within the granted limits or sent to the owner for approval.
8. The smart contract validates the authorised operation.
9. USDC is transferred.
10. The transaction appears in the dashboard with a verifiable NEAR Explorer link.

Also demonstrate a rejected transaction above the permitted limit.

This demonstrates that Bizgent is more than a chatbot: it connects AI, business rules and real blockchain execution.

# 14. Development instructions for Claude Code

Claude Code is the development tool. NEAR AI Cloud is the preferred runtime AI provider inside the finished application. Do not confuse these two roles.

Follow these instructions:

1. Read this entire master specification before coding.
2. Do not silently remove major requirements.
3. Do not invent blockchain APIs or assume that a contract method exists.
4. Verify NEAR SDK and NEP-141 interfaces against official documentation.
5. Keep the frontend, backend and contract architecture consistent.
6. Work phase by phase.
7. Do not begin a later phase before the current phase passes its acceptance checks.
8. Run builds and tests and fix errors rather than merely reporting them.
9. Do not use fake transaction success or fake security guarantees.
10. Keep secrets out of the repository.
11. Use JavaScript for the frontend and backend.
12. Write clean, maintainable code suitable for a developer to understand and extend.
13. Avoid unnecessary dependencies and features outside the MVP.
14. Maintain useful documentation as the project develops.
15. Commit completed phases with meaningful Git commit messages.
16. Report what was implemented, tested, what remains incomplete and any security limitations at the end of each phase.

**Priority:** A smaller, fully working and verifiable financial workflow is better than a large application with unfinished or simulated core functionality.

---

# ADDITIONAL REQUIREMENTS AND CLARIFICATIONS

These requirements extend and clarify the existing Bizgent master specification. They are mandatory and should be considered during architecture planning and implementation.

## 1. Frontend Mock Data and Backend Integration

During Phase 1, mock data may be used to build and demonstrate the frontend while the backend is not yet available.

However, the frontend must be designed for a clean transition to real backend data.

Requirements:

- Keep mock data separate from actual API services. Do not hardcode mock records directly throughout page components.
- Create a centralised API service layer for all backend requests.
- Define the expected API response structures early so frontend and backend development follow the same contract.
- During Phase 2, replace all mock data with actual API responses.
- Do not leave mock data silently appearing as if it were real user or business information.
- Mock data must only be available in an explicitly enabled development/demo mode.
- Production must never fall back to fabricated balances, transactions, expenses, approvals or user records.

Every data-driven page and component must support:

- Loading states while requests are in progress.
- Proper empty states when the API returns no records.
- Error states when a request fails.
- Retry actions where appropriate.
- Authentication-expired handling and appropriate redirects.
- Safe fallback UI that does not fabricate financial data.

If a request fails, display a clear message and offer retry where appropriate. Do not replace a failed balance or transaction request with mock financial information.

Use reusable loading, error, empty-state and data-fetching components where appropriate.

After backend integration, test every page to confirm that it displays actual authenticated API data and that no unintended mock data remains.

## 2. Centralised Environment Configuration

All environment-dependent settings must be configurable from centralised environment variables rather than scattered throughout the source code.

This includes:

- Application name and public application URL.
- Frontend and backend API URLs.
- Backend allowed origins.
- Email sender address and sender display name.
- Support and notification contact addresses.
- Brevo API credentials.
- AI provider and API credentials.
- Database connection.
- JWT configuration.
- NEAR network selection.
- NEAR RPC endpoint.
- Vault contract address.
- USDC token contract address.
- Other network-specific configuration.

Suggested backend environment variables:

APP_NAME=Bizgent
APP_BASE_URL=
FRONTEND_URL=
API_BASE_URL=
ALLOWED_ORIGINS=

BREVO_API_KEY=
BREVO_SENDER_EMAIL=
BREVO_SENDER_NAME=Bizgent
SUPPORT_EMAIL=

AI_PROVIDER=
AI_API_KEY=
AI_MODEL=

MONGODB_URI=
JWT_SECRET=
JWT_EXPIRES_IN=

NEAR_NETWORK=testnet
NEAR_RPC_URL=
BIZGENT_CONTRACT_ID=
USDC_CONTRACT_ID=

These are example variable names, not actual credentials. Choose the final names consistently throughout the project.

Requirements:

- Create `.env.example` files with placeholder values.
- Never commit actual `.env` files or secrets to GitHub.
- Validate required environment variables during backend startup.
- Fail safely with a clear configuration error if a required variable is missing.
- Keep frontend-exposed variables limited to public configuration. Never expose secrets through `VITE_` variables.
- Do not hardcode sender email addresses, support email addresses, API URLs or contract addresses inside application components or business logic.
- Changing a sender address, application URL or network configuration should require changing the relevant environment configuration, not editing multiple source files.

Email recipients must come from the relevant user's or business contact information, not from a hardcoded recipient address.

The sender identity must be configured centrally and must use an address that has been verified and authorised with Brevo. Do not assume that any Gmail address can automatically be used as a verified sender.

Email templates should also be reusable and centrally managed. Avoid duplicating notification email content across different routes.

Keep WhatsApp notification configuration separate from email configuration, even if both are delivered through Brevo.

## 3. Currency Display and Financial Formatting

Bizgent's primary treasury and payment asset is native USDC on NEAR.

The application must clearly distinguish between:

1. USDC token amounts.
2. USD-denominated reporting or equivalent values.

For actual treasury balances, deposits, withdrawals and blockchain transactions, display the token denomination explicitly, for example:

1,250.00 USDC

For business reports and expense summaries, USD formatting may be used where the amount is an accounting/reporting value, for example:

$1,250.00 USD

Where a USDC amount is also shown as a USD equivalent, label it clearly. Do not imply that an estimated or calculated equivalent is a separate fiat balance.

Use reusable currency-formatting utilities instead of manually adding `$` or `USDC` throughout the frontend.

Requirements:

- Never use floating-point arithmetic for financial calculations.
- Store and process on-chain token amounts in integer base units.
- Respect the token's actual decimal configuration.
- Use appropriate decimal formatting for display.
- Never silently round an amount in a way that changes the actual payment.
- Ensure the amount and asset shown to the user match the amount and asset submitted for execution.

For the MVP, USDC is the primary payment asset. Do not introduce unnecessary multi-currency complexity.

## 4. Testnet and Mainnet Environments

Bizgent must support separate testnet and mainnet configurations.

Development and testing must begin on NEAR testnet.

Testnet requirements:

- Use a dedicated NEAR testnet wallet/account.
- Use testnet NEAR tokens for network gas and deployment operations.
- Use the official testnet USDC contract, not the mainnet USDC contract.
- Use testnet vault contracts deployed specifically for testing.
- Clearly label the entire application as TESTNET or DEMO when connected to testnet.
- Never represent testnet USDC as real money.
- Ensure that testnet transactions cannot accidentally be submitted to mainnet.

Mainnet requirements:

- Use the official native USDC contract on NEAR.
- Use a separately deployed and verified mainnet Bizgent contract.
- Use mainnet RPC and wallet configuration.
- Require an explicit, deliberate deployment/configuration change before mainnet is enabled.
- Do not silently switch networks.
- Display the active network clearly in the interface.
- Verify the token and contract addresses before enabling real transactions.

Network configuration must be centralised. The application should not require source-code rewrites to switch from testnet to mainnet.

Do not hardcode testnet or mainnet contract addresses in multiple files.

## 5. Testnet Funding and Demonstration

The project must include documentation explaining how the developer obtains testnet NEAR and testnet USDC.

Testnet NEAR is required for gas and deployment operations. Testnet USDC is required for testing deposits, balances and payments.

Testnet tokens have no real financial value and must never be presented as real funds.

The developer documentation must explain how to:

- Create a NEAR testnet account.
- Obtain testnet NEAR.
- Obtain testnet USDC.
- Connect the testnet wallet to Bizgent.
- Deploy the testnet contract.
- Test deposits, payments, withdrawals and approvals.

## 6. Financial Data Integrity and UI Fallbacks

Financial information must always be traceable to its actual source.

- Treasury balances must come from verified on-chain information or clearly identified backend accounting records.
- Transactions must not be marked successful until the corresponding on-chain result has been verified.
- Pending, failed, rejected and completed transactions must be visually distinguishable.
- A network or API failure must never be presented as a zero balance unless the balance was successfully fetched and is genuinely zero.
- Do not use placeholder transaction hashes or fabricated blockchain confirmations in production.
- If on-chain and backend records disagree, flag the inconsistency rather than silently choosing one.

## 7. Documentation and Acceptance Tests

Update the README and developer documentation to explain:

- Environment variable setup.
- Testnet wallet creation and funding.
- Testnet USDC acquisition.
- Testnet deployment.
- Mainnet deployment precautions.
- Email sender configuration.
- AI provider configuration.
- Frontend mock-data replacement and API integration.

Add acceptance tests confirming:

- Production does not display mock financial records.
- API failures display proper error states.
- Loading and empty states work correctly.
- Environment configuration is respected.
- The active network is clearly displayed.
- Testnet and mainnet contract configurations cannot be confused.
- Financial values are formatted with the correct asset denomination.
- Email sender details can be changed centrally without editing application logic.

# END OF MASTER SPECIFICATION