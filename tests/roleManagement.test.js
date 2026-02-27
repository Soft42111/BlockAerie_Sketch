import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { MockDiscordUser, MockDiscordGuildMember, MockDiscordGuild, MockDiscordRole } from '../mocks/discord.js';

describe('Role Management', () => {
    let mockGuild;
    let mockMember;
    let availableRoles;

    beforeAll(() => {
        mockGuild = new MockDiscordGuild('555666777', 'Test Server');
        availableRoles = [
            new MockDiscordRole('111', 'Admin', mockGuild, '#FF0000'),
            new MockDiscordRole('222', 'Moderator', mockGuild, '#00FF00'),
            new MockDiscordRole('333', 'Member', mockGuild, '#0000FF'),
            new MockDiscordRole('444', 'Newcomer', mockGuild, '#808080'),
            new MockDiscordRole('555', 'Verified', mockGuild, '#FFD700')
        ];
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Role Assignment', () => {
        it('should add a role to a user', () => {
            const member = new MockDiscordGuildMember(
                new MockDiscordUser('123', 'User', 'User#0'),
                []
            );

            const addRole = (member, roleId) => {
                member.addRole(roleId);
                return member.hasRole(roleId);
            };

            expect(addRole(member, '333')).toBe(true);
        });

        it('should remove a role from a user', () => {
            const member = new MockDiscordGuildMember(
                new MockDiscordUser('123', 'User', 'User#0'),
                ['333', '444']
            );

            const removeRole = (member, roleId) => {
                member.removeRole(roleId);
                return !member.hasRole(roleId);
            };

            expect(removeRole(member, '333')).toBe(true);
            expect(member.hasRole('444')).toBe(true);
        });

        it('should check if user has a role', () => {
            const member = new MockDiscordGuildMember(
                new MockDiscordUser('123', 'User', 'User#0'),
                ['111', '222']
            );

            expect(member.hasRole('111')).toBe(true);
            expect(member.hasRole('333')).toBe(false);
        });

        it('should handle multiple role assignments', () => {
            const member = new MockDiscordGuildMember(
                new MockDiscordUser('123', 'User', 'User#0'),
                []
            );

            const addRoles = (member, roleIds) => {
                roleIds.forEach(roleId => member.addRole(roleId));
                return roleIds.every(roleId => member.hasRole(roleId));
            };

            expect(addRoles(member, ['333', '444', '555'])).toBe(true);
            expect(member.roles.cache.size).toBe(3);
        });
    });

    describe('Role Hierarchy', () => {
        it('should respect role hierarchy for permissions', () => {
            const roles = [
                { id: '111', position: 5, permissions: { manageRoles: true } },
                { id: '222', position: 4, permissions: { manageRoles: true } },
                { id: '333', position: 3, permissions: { manageRoles: false } }
            ];

            const canManageRole = (actorRole, targetRole) => {
                return actorRole.position > targetRole.position;
            };

            expect(canManageRole(roles[0], roles[2])).toBe(true);
            expect(canManageRole(roles[1], roles[0])).toBe(false);
            expect(canManageRole(roles[2], roles[2])).toBe(false);
        });

        it('should not allow modifying higher roles', () => {
            const memberRoles = [
                { id: '333', position: 3 },
                { id: '111', position: 5 }
            ];

            const canModifyRole = (roleId, memberRoleIds, memberRolePositions) => {
                const targetPos = availableRoles.find(r => r.id === roleId)?.position || 0;
                const memberMaxPos = Math.max(...memberRolePositions);
                return targetPos < memberMaxPos;
            };

            expect(canModifyRole('333', memberRoles, [3, 5])).toBe(false);
            expect(canModifyRole('444', memberRoles, [3, 5])).toBe(true);
        });
    });

    describe('Role-Based Permissions', () => {
        it('should check permissions based on roles', () => {
            const checkPermission = (member, permission) => {
                const rolePermissions = member.roles.cache.values();
                for (const role of rolePermissions) {
                    if (role.permissions.has(permission)) {
                        return true;
                    }
                }
                return false;
            };

            const modRole = new MockDiscordRole('222', 'Mod', mockGuild);
            modRole.permissions.bitfield = 1n << 32 | 1n << 1;

            const member = new MockDiscordGuildMember(
                new MockDiscordUser('123', 'User', 'User#0'),
                [modRole]
            );

            expect(checkPermission(member, 'KICK_MEMBERS')).toBe(true);
        });

        it('should combine permissions from multiple roles', () => {
            const role1 = new MockDiscordRole('333', 'Role1', mockGuild);
            role1.permissions.bitfield = 1n << 11;

            const role2 = new MockDiscordRole('444', 'Role2', mockGuild);
            role2.permissions.bitfield = 1n << 1;

            const combinedPermissions = [role1, role2].reduce(
                (acc, role) => acc | role.permissions.bitfield,
                0n
            );

            const perm1 = (combinedPermissions & (1n << 11n)) !== 0n;
            const perm2 = (combinedPermissions & (1n << 1n)) !== 0n;
            const perm3 = (combinedPermissions & (1n << 32n)) !== 0n;

            expect(perm1).toBe(true);
            expect(perm2).toBe(true);
            expect(perm3).toBe(false);
        });
    });

    describe('Auto Role Assignment', () => {
        it('should assign newcomer role on join', async () => {
            const assignAutoRole = async (member, autoRoleId) => {
                member.addRole(autoRoleId);
                return member.hasRole(autoRoleId);
            };

            const newMember = new MockDiscordGuildMember(
                new MockDiscordUser('789', 'NewUser', 'NewUser#0'),
                []
            );

            const assigned = await assignAutoRole(newMember, '444');
            expect(assigned).toBe(true);
        });

        it('should verify user before removing newcomer role', async () => {
            const REQUIREMENTS = {
                accountAge: 604800000,
                messageCount: 10,
                verified: true
            };

            const user = {
                createdAt: Date.now() - 1209600000,
                messageCount: 15,
                verified: true
            };

            const canRemoveNewcomer = (userData) => {
                const accountOldEnough = Date.now() - new Date(userData.createdAt).getTime() > REQUIREMENTS.accountAge;
                const enoughMessages = userData.messageCount >= REQUIREMENTS.messageCount;
                const isVerified = userData.verified === REQUIREMENTS.verified;
                return accountOldEnough && enoughMessages && isVerified;
            };

            expect(canRemoveNewcomer(user)).toBe(true);
        });
    });

    describe('Role Commands', () => {
        it('should list available roles', () => {
            const listRoles = (roles) => {
                return roles.map(r => ({ id: r.id, name: r.name, color: r.color }));
            };

            const roleList = listRoles(availableRoles);
            expect(roleList.length).toBe(5);
            expect(roleList[0].name).toBe('Admin');
        });

        it('should search roles by name', () => {
            const searchRoles = (roles, query) => {
                return roles.filter(r =>
                    r.name.toLowerCase().includes(query.toLowerCase())
                );
            };

            const results = searchRoles(availableRoles, 'mod');
            expect(results.length).toBe(1);
            expect(results[0].name).toBe('Moderator');
        });

        it('should handle role not found', () => {
            const findRole = (roles, roleId) => {
                return roles.find(r => r.id === roleId) || null;
            };

            expect(findRole(availableRoles, '999')).toBeNull();
            expect(findRole(availableRoles, '222')).toBeDefined();
        });
    });

    describe('Role Management Logging', () => {
        it('should log role changes', async () => {
            const roleChangeLogs = [];

            const logRoleChange = async (userId, roleId, action, moderatorId) => {
                roleChangeLogs.push({
                    userId,
                    roleId,
                    action,
                    moderatorId,
                    timestamp: new Date().toISOString()
                });
            };

            await logRoleChange('123', '333', 'add', '999');
            expect(roleChangeLogs.length).toBe(1);
            expect(roleChangeLogs[0].action).toBe('add');
        });

        it('should generate role audit report', async () => {
            const logs = [
                { action: 'add', roleId: '333', timestamp: Date.now() - 86400000 },
                { action: 'remove', roleId: '444', timestamp: Date.now() - 43200000 },
                { action: 'add', roleId: '555', timestamp: Date.now() }
            ];

            const generateAudit = (logEntries) => {
                return {
                    totalChanges: logEntries.length,
                    additions: logEntries.filter(l => l.action === 'add').length,
                    removals: logEntries.filter(l => l.action === 'remove').length,
                    recentChanges: logEntries.slice(-5)
                };
            };

            const audit = generateAudit(logs);
            expect(audit.totalChanges).toBe(3);
            expect(audit.additions).toBe(2);
            expect(audit.removals).toBe(1);
        });
    });

    describe('Reaction Roles', () => {
        it('should assign role on reaction add', async () => {
            const reactionRoles = new Map([
                ['👍', '111'],
                ['👎', '222'],
                ['🎉', '333']
            ]);

            const assignReactionRole = async (emoji, member) => {
                const roleId = reactionRoles.get(emoji);
                if (roleId) {
                    member.addRole(roleId);
                    return true;
                }
                return false;
            };

            const member = new MockDiscordGuildMember(
                new MockDiscordUser('123', 'User', 'User#0'),
                []
            );

            expect(await assignReactionRole('👍', member)).toBe(true);
            expect(member.hasRole('111')).toBe(true);
        });

        it('should remove role on reaction remove', async () => {
            const reactionRoles = new Map([
                ['👍', '111']
            ]);

            const removeReactionRole = async (emoji, member) => {
                const roleId = reactionRoles.get(emoji);
                if (roleId) {
                    member.removeRole(roleId);
                    return true;
                }
                return false;
            };

            const member = new MockDiscordGuildMember(
                new MockDiscordUser('123', 'User', 'User#0'),
                ['111']
            );

            expect(await removeReactionRole('👍', member)).toBe(true);
            expect(member.hasRole('111')).toBe(false);
        });
    });
});

describe('Role Configuration', () => {
    it('should validate role configuration', () => {
        const validateRoleConfig = (config) => {
            const errors = [];
            if (!config.name || config.name.trim() === '') {
                errors.push('Role name is required');
            }
            if (config.color && !/^#[0-9A-Fa-f]{6}$/.test(config.color)) {
                errors.push('Invalid color format');
            }
            if (config.position < 0) {
                errors.push('Position must be non-negative');
            }
            return { valid: errors.length === 0, errors };
        };

        expect(validateRoleConfig({ name: 'Test', color: '#FF0000', position: 1 }).valid).toBe(true);
        expect(validateRoleConfig({ name: '', color: '#FF0000', position: 1 }).valid).toBe(false);
        expect(validateRoleConfig({ name: 'Test', color: 'red', position: 1 }).valid).toBe(false);
    });

    it('should generate role mention string', () => {
        const generateMention = (roleId) => {
            return `<@&${roleId}>`;
        };

        expect(generateMention('123')).toBe('<@&123>');
    });

    it('should format role information for display', () => {
        const formatRoleInfo = (role) => {
            return {
                name: role.name,
                id: role.id,
                color: role.color,
                memberCount: role.guild?.memberCount || 0,
                position: role.position,
                permissions: Object.keys(role.permissions).filter(p => role.permissions[p])
            };
        };

        const mockGuild = new MockDiscordGuild('555', 'Test');
        const role = new MockDiscordRole('123', 'TestRole', mockGuild, '#FF0000');

        const info = formatRoleInfo(role);
        expect(info.name).toBe('TestRole');
        expect(info.id).toBe('123');
        expect(info.color).toBe('#FF0000');
    });
});
