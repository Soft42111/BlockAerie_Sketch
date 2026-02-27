# 🦅 BlockAerie Sketch: PFP Architect & Community Guardian

A professional Discord bot that generates high-quality AI image prompts for web3/NFT-styled profile pictures AND protects your community with advanced moderation tools. Powered by **Google Gemini 1.5** and **Sogni AI Supernet**.

![AuraPrompt Header](https://skillicons.dev/icons?i=discord,nodejs,js,git)

---

## ✨ Features

- 🎨 **Direct Image Generation**: Use `!prompt <description>` for instant image creation without questions.
- 🎬 **Video Generation**: Use `!video-prompt <description>` for text-to-video or image-to-video (when an image is attached).
- 🛡️ **Advanced Moderation**: Ban, kick, mute, and warn users with logging and case IDs.
- 🤖 **Auto-Moderation**: Configure rules to automatically punish spammers or repeat offenders.
- 💬 **Conversational AI**: Tag the bot for intelligent assistance, feature explanations, or prompt help.
- 🧠 **AI-Powered Core**: Uses Google's Gemini 1.5 Flash for high-fidelity prompt engineering and chat.
- 🖼️ **Sogni V4 Integration**: One-click high-quality image and video generation using the Sogni AI Supernet.
- 🎯 **CRISPE Framework**: Interactive prompts follow a professional structure.
- 🛡️ **Session Management**: Robust multi-user support with session locking and timeouts.
- 📈 **Leveling System**: XP tracking, ranks, and leaderboards to engage users.
- 💾 **Server Backups**: Complete server state backup and restoration tools.
- 👁️ **Audit Logging**: Comprehensive event tracking (deletes, edits, roles) and health monitoring.
- 🛡️ **AI Safety**: Advanced AI content scanning and whistleblower protection.

---

## 🛠️ Setup Guide

### 1. Prerequisites
- **Node.js**: Version 18.0.0 or higher.
- **Discord Bot**: Created via the Discord Developer Portal.
- **Gemini API Key**: From [Google AI Studio](https://aistudio.google.com/).
- **Sogni Account**: Required for image generation functionality.

### 2. Discord Developer Portal Setup
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
3. Go to **"Bot"** in the sidebar.
4. **Reset/Copy Token**: Save this for later (`DISCORD_TOKEN`).
5. **Privileged Gateway Intents**: Enable **Message Content Intent**, **Server Members Intent**, and **Presence Intent**.
6. **Installation**: Under "OAuth2" -> "URL Generator", select `bot` scope and `Administrator` permission. Use the generated URL to invite the bot to your server.

### 2.1 Enable "Add App" Button in Bio
To let users add the bot to their servers directly from its profile bio:
1. Go to the **Discord Developer Portal**.
2. Select your application.
3. Go to **"Bot"** -> **"Public Bot"** (Ensure this is ON).
4. Go to **"Installation"** (Sidebar).
5. In **"Install Link"**, select **"Discord Provided Link"**.
6. Set **"Scopes"** to `bot` and `applications.commands`.
7. Set **"Permissions"** to `Administrator` (or your preferred minimal setup).
8. Save Changes. The "Add App" button will now appear on the bot's Discord profile!

### 3. Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/blockaerie-sketch.git
cd blockaerie-sketch

# Install dependencies
npm install
```

### 4. Environment Configuration
Create a `.env` file in the root directory (or copy `.env.example`):
```bash
cp .env.example .env
```

Fill in your credentials:
- `DISCORD_TOKEN`: Your bot token.
- `GEMINI_API_KEY`: Your Google AI API key.
- `SOGNI_USERNAME` & `SOGNI_PASSWORD`: Your Sogni AI credentials.
- `COMMAND_PREFIX`: Default is `!`.

---

## 🎮 Commands

### Creative Commands
| Command | Action |
| :--- | :--- |
| `!prompt <text>` | Generates an image instantly based on your description. |
| `!video-prompt <text>` | Generates a 5s-10s video. Attach an image for image-to-video. |
| `!pfp` or `!generate-pfp` | Starts the interactive 4-step prompt generation flow. |
| `@Bot <question>` | Talk to the bot conversationally. |
| `!help` | Displays the help menu and command list. |
| `!ping` | Checks bot latency and Sogni AI connectivity status. |

### Moderation Commands
*Requires appropriate permissions (Ban/Kick/Moderate Members)*
| Command | Usage | Action |
| :--- | :--- | :--- |
| `!ban` | `!ban @user [reason]` | Bans a user from the server. |
| `!kick` | `!kick @user [reason]` | Kicks a user from the server. |
| `!timeout` | `!timeout @user <duration> [reason]` | Times out (mutes) a user. Duration: `1h`, `30m`, `1d`. |
| `!untimeout` | `!untimeout @user` | Removes a timeout. |
| `!warn` | `!warn @user [reason]` | Issues a formal warning to a user. |
| `!warnings` | `!warnings @user` | Lists a user's warning history. |
| `!clearwarnings` | `!clearwarnings @user` | Clears all warnings for a user. |
| `!clear` | `!clear <number>` | Bulk delete up to 100 messages (purge). |
| `!lock` | `!lock` | Toggle channel lock (view-only for regular users). |
| `!modlog` | `!modlog #channel` | Sets the channel for moderation logs. |

### Admin Commands
*Restricted to Bot Admin / Server Owner*
| Command | Usage | Action |
| :--- | :--- | :--- |
| `!automod` | `!automod list/add/remove` | Configure auto-moderation rules. |
| `!raid` | `!raid on/off` | Toggle emergency raid protection. |
| `!add-slur` | `!add-slur <word>` | Adds a word to the blocklist. |
| `!remove-slur` | `!remove-slur <word>` | Removes a word from the blocklist. |
| `!admin-immunity` | `!admin-immunity on/off` | Toggles whether the admin is immune to filters. |
| `!lock-immunity` | `!lock-immunity @role` | Grants a specific role bypass to channel locks. |
| `!mod-guide` | `!mod-guide` | Shows the comprehensive moderation setup guide. |
| `!status` | `!status` | Checks status of all AI models. |
| `!cancel` | `!cancel` | Cancels an active generation session. |
| `!kill` | `!kill` | Instructions for clearing duplicate bot processes. |

### User Engagement
| Command | Usage | Action |
| :--- | :--- | :--- |
| `/rank` | `/rank [user]` | Check XP level and rank card. |
| `/leaderboard` | `/leaderboard` | View top 10 XP leaders. |
| `/report` | `/report @user reason` | Privately report a user to mods. |

### Server & Admin Ops
*Restricted to Admins*
| Command | Usage | Action |
| :--- | :--- | :--- |
| `/server` | `/server backup/restore` | Manage full server backups. |
| `/safety` | `/safety whitelist/scan` | Configure AI safety settings. |
| `/logging` | `/logging config/test` | Manage audit log settings. |
| `/slurs` | `/slurs list/add` | Manage forbidden words. |
| `/kill-instances`| `/kill-instances` | Terminate zombie processes. |

---

## 🏗️ Technical Architecture

- **`src/index.js`**: Main entry point and command router.
- **`src/promptGenerator.js`**: Handles logic for Gemini AI prompt engineering.
- **`src/imageGenerator.js`**: Connects to Sogni AI Supernet for image output.
- **`src/stateManager.js`**: Manages user session persistence.
- **`src/utils/`**: Shared utilities for formatting and error handling.

---

## 🤝 Open Source & AI Integration

If you wish to use an AI to help maintain or extend this project, we have provided a specialized prompt in `PROMPT_FOR_AI.md` to help other LLMs understand the codebase instantly.

### Why BlockAerie Sketch?
Traditional prompt generators are generic. **BlockAerie Sketch** is specifically designed for the **Web3** era, ensuring that generated avatars look like they belong on a premium NFT marketplace or as a professional brand identity.

---

## 📜 License
This project is licensed under the **MIT License**.

---

**Crafted with ❤️ for the Web3 community by Basit**
> "Your PFP is your digital soul. **BlockAerie Sketch** makes it legendary."