class MockDiscordUser {
    constructor(id, username, tag) {
        this.id = id;
        this.username = username;
        this.tag = tag;
        this.bot = false;
        this.system = false;
        this.createdAt = new Date();
        this.avatar = null;
        this.displayAvatarURL = jest.fn(() => `https://cdn.discordapp.com/avatars/${id}/avatar.png`);
    }

    toString() {
        return `<@${this.id}>`;
    }
}

class MockDiscordGuildMember {
    constructor(user, roles = [], nick = null) {
        this.user = user;
        this.id = user.id;
        this.roles = { cache: new Map(roles.map(r => [r, { id: r }])) };
        this.nickname = nick;
        this.displayName = nick || user.username;
        this.joinedAt = new Date();
        this.boostingSince = null;
        this.premiumSince = null;
        this.communicationDisabledUntil = null;
        this.manageable = true;
        this.kickable = true;
        this.bannable = true;
    }

    addRole(roleId) {
        this.roles.cache.set(roleId, { id: roleId });
        return this;
    }

    removeRole(roleId) {
        this.roles.cache.delete(roleId);
        return this;
    }

    hasRole(roleId) {
        return this.roles.cache.has(roleId);
    }

    toString() {
        return `<@${this.id}>`;
    }
}

class MockDiscordTextChannel {
    constructor(id, name, guild) {
        this.id = id;
        this.name = name;
        this.guild = guild;
        this.type = 'GUILD_TEXT';
        this.topic = null;
        this.nsfw = false;
        messages = new MockMessageCollection(this);
        this.send = jest.fn().mockResolvedValue({});
        this.lastMessage = null;
        this.permissionOverwrites = new Map();
        this.rateLimitPerUser = 0;
        this.createdAt = new Date();
    }

    async send(content, options) {
        const message = new MockDiscordMessage('0', content, this, new MockDiscordUser('0', 'Bot', 'Bot#0'));
        return message;
    }

    clone() {
        return new MockDiscordTextChannel(this.id, this.name, this.guild);
    }

    delete() {
        return Promise.resolve();
    }
}

class MockDiscordVoiceChannel {
    constructor(id, name, guild) {
        this.id = id;
        this.name = name;
        this.guild = guild;
        this.type = 'GUILD_VOICE';
        this.bitrate = 64000;
        this.userLimit = 0;
        this.members = new Map();
        this.createdAt = new Date();
    }
}

class MockDiscordCategoryChannel {
    constructor(id, name, guild) {
        this.id = id;
        this.name = name;
        this.guild = guild;
        this.type = 'GUILD_CATEGORY';
        this.children = new Map();
        this.createdAt = new Date();
    }
}

class MockDiscordMessage {
    constructor(id, content, channel, author) {
        this.id = id;
        this.content = content;
        this.channel = channel;
        this.author = author;
        this.guild = channel?.guild;
        this.createdAt = new Date();
        this.editedAt = null;
        this.pinned = false;
        this.tts = false;
        this.embeds = [];
        this.attachments = new Map();
        this.reactions = new Map();
        this.member = null;
    }

    async delete() {
        return this;
    }

    async edit(content) {
        this.content = content;
        this.editedAt = new Date();
        return this;
    }

    async react(emoji) {
        return this;
    }

    reply(content) {
        return Promise.resolve(this);
    }
}

class MockMessageCollection extends Map {
    constructor(channel) {
        super();
        this.channel = channel;
    }

    async fetch(options = {}) {
        return new Map();
    }

    async find(func) {
        return null;
    }
}

class MockDiscordRole {
    constructor(id, name, guild, color = null) {
        this.id = id;
        this.name = name;
        this.guild = guild;
        this.color = color || '#000000';
        this.hoist = false;
        this.managed = false;
        this.mentionable = true;
        this.position = 0;
        this.permissions = new MockPermissions();
        this.createdAt = new Date();
    }

    toString() {
        return `<@&${this.id}>`;
    }
}

class MockPermissions {
    constructor(bitfield = 0n) {
        this.bitfield = bitfield;
    }

    has(permission, checkAdmin = false) {
        const permMap = {
            'MANAGE_ROLES': 1n << 32,
            'BAN_MEMBERS': 1n << 2,
            'KICK_MEMBERS': 1n << 1,
            'MANAGE_MESSAGES': 1n << 14,
            'VIEW_AUDIT_LOG': 1n << 35,
            'SEND_MESSAGES': 1n << 11,
            'READ_MESSAGE_HISTORY': 1n << 36,
            'MANAGE_CHANNELS': 1n << 4,
            'MOVE_MEMBERS': 1n << 13,
        };
        return (this.bitfield & permMap[permission]) !== 0n;
    }
}

class MockDiscordGuild {
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this.icon = null;
        this.splash = null;
        this.discoverySplash = null;
        this.region = 'us-west';
        this.memberCount = 0;
        this.large = false;
        this.features = [];
        this.premiumTier = 0;
        this.premiumSubscriptionCount = 0;
        this.verified = false;
        this.partnered = false;
        this.mfaLevel = 0;
        this.explicitContentFilter = 0;
        this.defaultMessageNotifications = 0;
        this.systemChannelFlags = new MockPermissions();
        this.createdAt = new Date();

        this.members = new Map();
        this.channels = new Map();
        this.roles = new Map();
        this.presences = new Map();
    }

    addMember(user) {
        const member = new MockDiscordGuildMember(user);
        this.members.set(user.id, member);
        this.memberCount++;
        return member;
    }

    createTextChannel(name, options = {}) {
        const channel = new MockDiscordTextChannel(
            Math.random().toString(36).substring(7),
            name,
            this
        );
        this.channels.set(channel.id, channel);
        return Promise.resolve(channel);
    }

    createVoiceChannel(name, options = {}) {
        const channel = new MockDiscordVoiceChannel(
            Math.random().toString(36).substring(7),
            name,
            this
        );
        this.channels.set(channel.id, channel);
        return Promise.resolve(channel);
    }

    createRole(options = {}) {
        const role = new MockDiscordRole(
            Math.random().toString(36).substring(7),
            options.name || 'New Role',
            this,
            options.color
        );
        this.roles.set(role.id, role);
        return Promise.resolve(role);
    }

    fetchAuditLogs(options = {}) {
        return Promise.resolve({
            entries: new Map(),
            toJSON: () => ({ entries: [] })
        });
    }

    fetchWidget() {
        return Promise.resolve({ enabled: false });
    }

    fetchVanityURL() {
        return Promise.resolve(null);
    }
}

class MockDiscordClient {
    constructor() {
        this.user = new MockDiscordUser('0', 'TestBot', 'TestBot#0');
        this.users = new Map();
        this.guilds = new Map();
        this.channels = new Map();
        this.readyAt = new Date();
        this.shard = null;
        this.ws = { status: 0 };
        this.options = {
            messageEditHistoryMaxSize: 100,
            messageSweepInterval: 0,
            messageSweepAge: 0
        };

        this.on = jest.fn();
        this.off = jest.fn();
        this.once = jest.fn();
        this.emit = jest.fn();
    }

    async login(token) {
        return Promise.resolve(token);
    }

    async destroy() {
        return Promise.resolve();
    }

    isReady() {
        return true;
    }

    fetchApplication() {
        return Promise.resolve({
            id: '0',
            name: 'TestBot',
            description: '',
            icon: null,
            botPublic: true,
            botRequireCodeGrant: false,
            owner: null
        });
    }
}

class MockInteraction {
    constructor(type, data = {}) {
        this.type = type;
        this.id = Math.random().toString(36).substring(7);
        this.token = Math.random().toString(36).substring(7);
        this.createdAt = new Date();
        this.user = new MockDiscordUser('0', 'User', 'User#0');
        this.guild = null;
        this.channel = null;
        this.member = null;
        this.options = new MockApplicationCommandInteractionDataResolved(data);
        this.replied = false;
        this.deferred = false;

        this.isChatInputCommand = () => type === 2;
        this.isButton = () => type === 3;
        this.isSelectMenu = () => type === 3;
    }

    async reply(content) {
        this.replied = true;
        return Promise.resolve();
    }

    async deferReply() {
        this.deferred = true;
        return Promise.resolve();
    }

    async editReply(content) {
        return Promise.resolve();
    }

    async followUp(content) {
        return Promise.resolve();
    }

    async deferUpdate() {
        return Promise.resolve();
    }

    async update(content) {
        return Promise.resolve();
    }
}

class MockApplicationCommandInteractionDataResolved {
    constructor(data) {
        this.users = new Map(Object.entries(data.users || {}));
        this.members = new Map(Object.entries(data.members || {}));
        this.roles = new Map(Object.entries(data.roles || {}));
        this.channels = new Map(Object.entries(data.channels || {}));
        this.messages = new Map(Object.entries(data.messages || {}));
    }
}

class MockEmbed {
    constructor(data = {}) {
        this.title = data.title || '';
        this.description = data.description || '';
        this.url = data.url || '';
        this.color = data.color || null;
        this.timestamp = data.timestamp || null;
        this.fields = data.fields || [];
        this.author = data.author || null;
        this.footer = data.footer || null;
        this.image = data.image || null;
        this.thumbnail = data.thumbnail || null;
    }

    setTitle(title) {
        this.title = title;
        return this;
    }

    setDescription(description) {
        this.description = description;
        return this;
    }

    setColor(color) {
        this.color = color;
        return this;
    }

    setTimestamp(timestamp) {
        this.timestamp = timestamp;
        return this;
    }

    addFields(...fields) {
        this.fields.push(...fields.flat());
        return this;
    }
}

class MockActionRowBuilder {
    constructor() {
        this.components = [];
    }

    addComponents(...components) {
        this.components.push(...components.flat());
        return this;
    }

    static create() {
        return new MockActionRowBuilder();
    }
}

class MockButtonBuilder {
    constructor() {
        this.customId = '';
        this.label = '';
        this.style = 1;
        this.emoji = null;
        this.disabled = false;
    }

    setCustomId(id) {
        this.customId = id;
        return this;
    }

    setLabel(label) {
        this.label = label;
        return this;
    }

    setStyle(style) {
        this.style = style;
        return this;
    }

    setEmoji(emoji) {
        this.emoji = emoji;
        return this;
    }

    setDisabled(disabled) {
        this.disabled = disabled;
        return this;
    }

    static create() {
        return new MockButtonBuilder();
    }
}

class MockSelectMenuBuilder {
    constructor() {
        this.customId = '';
        this.placeholder = '';
        this.minValues = 1;
        this.maxValues = 1;
        this.options = [];
        this.disabled = false;
    }

    setCustomId(id) {
        this.customId = id;
        return this;
    }

    setPlaceholder(placeholder) {
        this.placeholder = placeholder;
        return this;
    }

    addOptions(...options) {
        this.options.push(...options);
        return this;
    }

    static create() {
        return new MockSelectMenuBuilder();
    }
}

const discordJsMock = {
    Client: MockDiscordClient,
    GatewayIntentBits: {
        Guilds: 1 << 6,
        GuildMembers: 1 << 1,
        GuildModeration: 1 << 4,
        GuildMessages: 1 << 9,
        GuildMessageReactions: 1 << 10,
        MessageContent: 1 << 15,
        GuildPresences: 1 << 12
    },
    PermissionsBitField: {
        Flags: {
            ManageRoles: 1n << 32,
            BanMembers: 1n << 2,
            KickMembers: 1n << 1,
            ManageMessages: 1n << 14,
            ViewAuditLog: 1n << 35,
            SendMessages: 1n << 11,
            ReadMessageHistory: 1n << 36,
            ManageChannels: 1n << 4,
            MoveMembers: 1n << 13
        }
    },
    EmbedBuilder: MockEmbed,
    ActionRowBuilder: MockActionRowBuilder,
    ButtonBuilder: MockButtonBuilder,
    StringSelectMenuBuilder: MockSelectMenuBuilder,
    ModalBuilder: class {},
    TextInputBuilder: class {},
    ChannelType: {
        GuildText: 0,
        GuildVoice: 2,
        GuildCategory: 4,
        GuildNews: 5,
        GuildStageVoice: 13
    },
    PermissionOverwrites: class {},
    REST: class {},
    Routes: {
        applicationCommand: (appId, cmdId) => `applications/${appId}/commands/${cmdId}`
    }
};

export {
    MockDiscordUser,
    MockDiscordGuildMember,
    MockDiscordTextChannel,
    MockDiscordVoiceChannel,
    MockDiscordCategoryChannel,
    MockDiscordMessage,
    MockDiscordGuild,
    MockDiscordRole,
    MockDiscordClient,
    MockInteraction,
    MockEmbed,
    MockActionRowBuilder,
    MockButtonBuilder,
    MockSelectMenuBuilder,
    MockPermissions
};

export default discordJsMock;
