// Role configuration using IDs for security and efficiency
class RoleConfig {
    constructor() {
        this.roles = {
            // Staff hierarchy roles (ordered by hierarchy level)
            T: {
                id: '504028917930262548',
                name: 'T',
                level: 6,
                permissions: ['*'] // All permissions
            },
            ADMINS: {
                id: '504031010200092682',
                name: 'Admins',
                level: 5,
                permissions: ['admin_commands', 'ban', 'unban', 'kick', 'mute', 'unmute', 'warn', 'purge', 'lock', 'unlock']
            },
            SENIOR_MODERATORS: {
                id: '1351675911367295017',
                name: 'Senior Moderators',
                level: 4,
                permissions: ['removepunishment', 'ban', 'unban', 'kick', 'mute', 'unmute', 'warn', 'purge', 'lock', 'unlock']
            },
            MODERATORS: {
                id: '1006755698803216425',
                name: 'Moderators',
                level: 3,
                permissions: ['ban', 'unban', 'kick', 'mute', 'unmute', 'warn', 'purge', 'lock', 'unlock']
            },
            HELPERS: {
                id: '1066909124819943526',
                name: 'Helpers',
                level: 2,
                permissions: ['mute', 'unmute', 'warn', 'setnick', 'addrole', 'removerole']
            },
            TRIAL_HELPERS: {
                id: '1318403675340931082',
                name: 'Trial Helpers',
                level: 1,
                permissions: ['warn', 'mute', 'unmute']
            },

            // Special roles
            STAFF: {
                id: '1351240039668908193',
                name: 'Staff',
                level: 0,
                permissions: []
            },
            TICKET_ACCESS: {
                id: '1277791038756487179',
                name: 'Ticket Access',
                level: 0,
                permissions: []
            },
            OUT_OF_OFFICE: {
                id: '1283960908753932328',
                name: 'Out of Office',
                level: 0,
                permissions: []
            },
            EVENT_MANAGERS: {
                id: '1328021909597847573',
                name: 'Event Managers',
                level: 0,
                permissions: ['createevent']
            },

            // Moderation roles
            MUTED: {
                id: '582112082091180052',
                name: 'Muted',
                level: 0,
                permissions: []
            },

            // Restriction roles
            IN_VC: {
                id: '1067590035756560425',
                name: 'In Vc',
                level: 0,
                permissions: []
            },
            NO_VCS: {
                id: '1325708938246881323',
                name: 'No Vc\'s',
                level: 0,
                permissions: []
            },
            NO_TICKETS: {
                id: '1325674369770586144',
                name: 'No Tickets',
                level: 0,
                permissions: []
            },
            NO_NICKNAME_REQUESTS: {
                id: '1325674439823589386',
                name: 'No Nickname Requests',
                level: 0,
                permissions: []
            },
            NO_GIFS: {
                id: '1370134955832770580',
                name: 'No Gifs',
                level: 0,
                permissions: []
            },
            NO_REACTIONS: {
                id: '1325674497734611014',
                name: 'No Reactions',
                level: 0,
                permissions: []
            },
            NO_EMBEDS_IMAGES: {
                id: '1325675011259764831',
                name: 'No Embeds/Images',
                level: 0,
                permissions: []
            },
            NO_FORUM_POSTS: {
                id: '1373283068210839785',
                name: 'No Forum Posts',
                level: 0,
                permissions: []
            },
            NO_EXTERNAL_EMOJI_STICKERS: {
                id: '1360044564668354602',
                name: 'No External Emoji\'s/Stickers',
                level: 0,
                permissions: []
            },

            // Community roles
            NITRO_BOOSTER: {
                id: '591486031161720853',
                name: 'Nitro Booster',
                level: 0,
                permissions: []
            },
            FRIENDS: {
                id: '1006758771915231232', // Replace with your Friends role ID
                name: 'Friends',
                level: 0,
                permissions: []
            }
        };

        // Create reverse lookup maps for efficiency
        this.idToKey = {};
        this.nameToKey = {};
        this.hierarchyRoles = [];

        for (const [key, role] of Object.entries(this.roles)) {
            this.idToKey[role.id] = key;
            this.nameToKey[role.name.toLowerCase()] = key;
            
            if (role.level > 0) {
                this.hierarchyRoles.push({
                    key,
                    id: role.id,
                    name: role.name,
                    level: role.level
                });
            }
        }

        // Sort hierarchy roles by level (highest first)
        this.hierarchyRoles.sort((a, b) => b.level - a.level);
    }

    /**
     * Get role configuration by key
     * @param {string} roleKey - The role key (e.g., 'ADMINS')
     * @returns {Object|null} Role configuration or null if not found
     */
    get(roleKey) {
        return this.roles[roleKey] || null;
    }

    /**
     * Get role ID by key
     * @param {string} roleKey - The role key
     * @returns {string|null} Role ID or null if not found
     */
    getId(roleKey) {
        const role = this.get(roleKey);
        return role ? role.id : null;
    }

    /**
     * Get role key by ID
     * @param {string} roleId - The role ID
     * @returns {string|null} Role key or null if not found
     */
    getKeyById(roleId) {
        return this.idToKey[roleId] || null;
    }

    /**
     * Get role key by name (case-insensitive)
     * @param {string} roleName - The role name
     * @returns {string|null} Role key or null if not found
     */
    getKeyByName(roleName) {
        return this.nameToKey[roleName.toLowerCase()] || null;
    }

    /**
     * Check if a member has a specific role
     * @param {GuildMember} member - Discord guild member
     * @param {string} roleKey - Role key to check
     * @returns {boolean} Whether the member has the role
     */
    memberHasRole(member, roleKey) {
        if (!member || !member.roles || !member.roles.cache) return false;
        const roleId = this.getId(roleKey);
        return roleId ? member.roles.cache.has(roleId) : false;
    }

    /**
     * Get the highest hierarchy level of a member
     * @param {GuildMember} member - Discord guild member
     * @returns {number} Highest hierarchy level (0 if no hierarchy roles)
     */
    getMemberHierarchyLevel(member) {
        if (!member || !member.roles || !member.roles.cache) return 0;
        
        let highestLevel = 0;
        for (const role of this.hierarchyRoles) {
            if (member.roles.cache.has(role.id)) {
                highestLevel = Math.max(highestLevel, role.level);
            }
        }
        return highestLevel;
    }

    /**
     * Get all hierarchy roles a member has
     * @param {GuildMember} member - Discord guild member
     * @returns {Array} Array of role objects the member has
     */
    getMemberHierarchyRoles(member) {
        if (!member || !member.roles || !member.roles.cache) return [];
        
        return this.hierarchyRoles.filter(role => 
            member.roles.cache.has(role.id)
        );
    }

    /**
     * Check if a member has permission for a specific command
     * @param {GuildMember} member - Discord guild member
     * @param {string} permission - Permission to check
     * @returns {boolean} Whether the member has permission
     */
    memberHasPermission(member, permission) {
        if (!member || !member.roles || !member.roles.cache) return false;
        
        // Check if member is guild owner
        if (member.id === member.guild.ownerId) return true;
        
        // Check if member has Administrator permission
        if (member.permissions.has('Administrator')) return true;
        
        // Check each role the member has
        for (const [roleId] of member.roles.cache) {
            const roleKey = this.getKeyById(roleId);
            if (roleKey) {
                const role = this.get(roleKey);
                if (role && (role.permissions.includes('*') || role.permissions.includes(permission))) {
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * Check if member meets minimum hierarchy level requirement
     * @param {GuildMember} member - Discord guild member
     * @param {string} requiredRoleKey - Required role key
     * @returns {boolean} Whether member meets requirement
     */
    memberMeetsHierarchyRequirement(member, requiredRoleKey) {
        const requiredRole = this.get(requiredRoleKey);
        if (!requiredRole) return false;
        
        const memberLevel = this.getMemberHierarchyLevel(member);
        return memberLevel >= requiredRole.level;
    }

    /**
     * Get all role IDs for message filter bypass roles
     * @returns {Array} Array of role IDs that bypass filters
     */
    getBypassRoleIds() {
        return [
            this.getId('HELPERS'),
            this.getId('MODERATORS'),
            this.getId('SENIOR_MODERATORS'),
            this.getId('ADMINS'),
            this.getId('T'),
            this.getId('STAFF')
        ].filter(id => id !== null);
    }

    /**
     * Validate all role IDs exist in the guild
     * @param {Guild} guild - Discord guild
     * @returns {Object} Validation results
     */
    async validate(guild) {
        const results = {
            valid: [],
            invalid: [],
            missing: []
        };

        for (const [key, role] of Object.entries(this.roles)) {
            try {
                const guildRole = await guild.roles.fetch(role.id);
                if (guildRole) {
                    results.valid.push({ key, id: role.id, name: role.name });
                } else {
                    results.missing.push({ key, id: role.id, name: role.name });
                }
            } catch (error) {
                results.invalid.push({ key, id: role.id, name: role.name, error: error.message });
            }
        }

        return results;
    }
}

module.exports = new RoleConfig(); 
