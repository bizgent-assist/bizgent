# Bizgent demo video

| File | What it is |
|---|---|
| `bizgent-demo.mp4` | 2:04, 1280×720 H.264/AAC, synthetic voice-over (Windows "Microsoft Zira" TTS) + burned-in captions. Ready to upload to X. |
| `bizgent-demo-no-voice.mp4` | Same video without audio, for recording your own voice-over over it. |
| `bizgent-demo.srt` | The narration with timings (use it as a script for your own voice-over, or as a caption file). |

## How it was made (honest disclosure)
- Recorded on 2026-11-11 by a headless Chrome script driving the **live** app at https://bizgent.vercel.app as the demo owner (Jayflint Studio, NEAR testnet). Nothing is mocked.
- Waiting time while the AI answered was trimmed. A short cut is also marked in the narration: the owner signature happens off camera, using the owner account's own key. That key signs exactly the `owner_pay` transaction the app prepared, which is what a wallet does. The app then verified the transaction on-chain.
- NearBlocks blocks headless browsers with a bot check. The two "on-chain" cards in the video are therefore rendered from the real NEAR RPC responses (`view_access_key_list`, `EXPERIMENTAL_tx_status`) instead of NearBlocks screenshots. Their NearBlocks links are below.

## Transactions created while recording (NEAR testnet)
| Scene | Transaction |
|---|---|
| AI assistant: "Pay the cloud storage invoice." → policy `auto` → agent pays 1 USDC with its function-call key | [7Q3j5Dkt…](https://testnet.nearblocks.io/txns/7Q3j5DktN9fybAEytvRwXbsF9dWPYcQBVsFn6SCLhb38) |
| AI assistant: "Pay the annual software licence." (3 USDC, over the 2 USDC limit) → approval → owner signs `owner_pay` | [9FP8ndAW…](https://testnet.nearblocks.io/txns/9FP8ndAW7EyMiNTp8cqcC5tRRn5XRo2dtXeNeYfcRZwQ) |

## Scenes
1. Title (0:00)
2. Problem: landing page (0:06)
3. Dashboard: balance read from the vault contract (0:18)
4. Agent & policy page: 2 USDC per payment, 5 USDC per day (0:29)
5. Agent account keys from RPC: one function-call key, `agent_pay` only (0:38)
6. AI assistant pays the cloud storage invoice live (0:45)
7. The transaction on-chain (1:04)
8. Over-limit licence → approval → review page (1:11)
9. Owner-signed `owner_pay`, verified (1:35)
10. README table of contract-rejected transactions (1:41)
11. Close: links (1:53)
