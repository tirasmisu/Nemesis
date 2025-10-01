const { Collection, PermissionsBitField, PermissionFlagsBits } = require('discord.js');
const { logError, CommandError } = require('./errorHandler');
const { createAuditLog } = require('./auditLogger');

// Permission levels
const PERMISSION_LEVELS = {
    EVERYONE: 0,
    MODERATOR: 1,
    ADMINISTRATOR: 2,
    OWNER: 3
};

// Default role permissions
const DEFAULT_ROLE_PERMISSIONS = {
    'moderator': {
        level: PERMISSION_LEVELS.MODERATOR,
        commands: ['warn', 'mute', 'kick', 'purge', 'lock', 'unlock', 'slowmode'],
        channels: ['mod-logs', 'mod-chat'],
        roles: ['moderator', 'helper']
    },
    'administrator': {
        level: PERMISSION_LEVELS.ADMINISTRATOR,
        commands: ['ban', 'unban', 'role', 'removerole', 'roleinfo'],
        channels: ['admin-logs', 'admin-chat'],
        roles: ['administrator', 'moderator', 'helper']
    },
    'owner': {
        level: PERMISSION_LEVELS.OWNER,
        commands: ['*'],
        channels: ['*'],
        roles: ['*']
    }
};

// Permission cache
const permissionCache = new Collection();

// Role hierarchy levels (higher number = more permissions)
const HIERARCHY_LEVELS = {
    'T': 6,
    'Admins': 5,
    'Senior Moderators': 4,
    'Moderators': 3,
    'Helpers': 2,
    'Trial Helpers': 1
};

// Command cooldowns (in milliseconds)
const COMMAND_COOLDOWNS = {
    warn: 5000,
    mute: 10000,
    ban: 15000,
    kick: 10000,
    purge: 5000,
    lock: 5000,
    unlock: 5000
};

// User cooldown storage
const userCooldowns = new Map();

// Initialize permission manager
async function initializePermissionManager(client) {
    try {
        // Load custom permissions from database if available
        const customPermissions = await loadCustomPermissions();
        
        // Initialize cache with default permissions
        for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
            permissionCache.set(role, {
                ...permissions,
                custom: customPermissions[role] || {}
            });
        }
        
        // Set up permission check interval
        setInterval(() => {
            refreshPermissionCache();
        }, 5 * 60 * 1000); // Refresh every 5 minutes
        
        return true;
    } catch (error) {
        console.error('Failed to initialize permission manager:', error);
        return false;
    }
}

// Load custom permissions from database
async function loadCustomPermissions() {
    try {
        // Implement database loading logic here
        return {};
    } catch (error) {
        console.error('Failed to load custom permissions:', error);
        return {};
    }
}

// Refresh permission cache
async function refreshPermissionCache() {
    try {
        const customPermissions = await loadCustomPermissions();
        
        // Update cache with new custom permissions
        for (const [role, permissions] of Object.entries(customPermissions)) {
            const existingPermissions = permissionCache.get(role) || DEFAULT_ROLE_PERMISSIONS[role] || {};
            permissionCache.set(role, {
                ...existingPermissions,
                custom: permissions
            });
        }
    } catch (error) {
        console.error('Failed to refresh permission cache:', error);
    }
}

// Check if user has permission for command
async function checkCommandPermission(interaction, commandName) {
    const member = interaction.member;
    if (!member) {
        throw new CommandError('Member not found', 'PERMISSION_DENIED');
    }

    // Check for Out of Office role - this blocks all commands unless the user is also an Admin
    const outOfOfficeRole = interaction.guild.roles.cache.find(role => role.name === 'Out of Office');
    if (outOfOfficeRole && member.roles.cache.has(outOfOfficeRole.id)) {
        const adminRole = interaction.guild.roles.cache.find(role => role.name === 'Admins');
        if (!adminRole || !member.roles.cache.has(adminRole.id)) {
            throw new CommandError(
                "You are currently Out of Office. Enjoy your time off! Only Admins can use commands while Out of Office.",
                'PERMISSION_DENIED'
            );
        }
    }

    // Check if user has admin permissions
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }

    // Get required roles for the command
    const requiredRoles = COMMAND_PERMISSIONS[commandName];
    if (!requiredRoles) {
        return true; // Command has no specific permission requirements
    }

    // Get member's highest role level
    const memberRoles = member.roles.cache;
    let highestRoleLevel = 0;

    for (const [roleName, level] of Object.entries(ROLE_HIERARCHY)) {
        if (memberRoles.some(role => role.name.toLowerCase().includes(roleName))) {
            highestRoleLevel = Math.max(highestRoleLevel, level);
        }
    }

    // Check if member has required role level
    const requiredLevel = Math.min(...requiredRoles.map(role => ROLE_HIERARCHY[role]));
    if (highestRoleLevel < requiredLevel) {
        throw new CommandError(
            `This command requires ${requiredRoles[0]} or higher role.`,
            'PERMISSION_DENIED'
        );
    }

    return true;
}

// Get highest permission level from roles
function getHighestPermissionLevel(roles) {
    let highestLevel = PERMISSION_LEVELS.EVERYONE;
    
    for (const role of roles) {
        const rolePermissions = permissionCache.get(role);
        if (rolePermissions && rolePermissions.level > highestLevel) {
            highestLevel = rolePermissions.level;
        }
    }
    
    return highestLevel;
}

// Get command permission level
function getCommandPermissionLevel(commandName) {
    // Default to moderator level for unknown commands
    return PERMISSION_LEVELS.MODERATOR;
}

// Update role permissions
async function updateRolePermissions(role, permissions, executor) {
    try {
        const existingPermissions = permissionCache.get(role) || {};
        const updatedPermissions = {
            ...existingPermissions,
            custom: {
                ...existingPermissions.custom,
                ...permissions
            }
        };
        
        // Update cache
        permissionCache.set(role, updatedPermissions);
        
        // Save to database
        await saveCustomPermissions(role, updatedPermissions.custom);
        
        // Log the change
        await createAuditLog({
            type: 'PERMISSION',
            action: 'UPDATE_ROLE_PERMISSIONS',
            targetId: role,
            executorId: executor.id,
            details: {
                role,
                permissions: updatedPermissions.custom
            }
        });
        
        return true;
    } catch (error) {
        console.error('Failed to update role permissions:', error);
        return false;
    }
}

// Save custom permissions to database
async function saveCustomPermissions(role, permissions) {
    try {
        // Implement database saving logic here
        return true;
    } catch (error) {
        console.error('Failed to save custom permissions:', error);
        return false;
    }
}

// Get role permissions
function getRolePermissions(role) {
    return permissionCache.get(role) || null;
}

// Check channel permission
async function checkChannelPermission(member, channelName) {
    try {
        const userRoles = member.roles.cache.map(role => role.name.toLowerCase());
        
        for (const role of userRoles) {
            const rolePermissions = permissionCache.get(role);
            if (rolePermissions) {
                // Check default permissions
                if (rolePermissions.channels.includes('*') || rolePermissions.channels.includes(channelName)) {
                    return true;
                }
                
                // Check custom permissions
                if (rolePermissions.custom.channels?.includes(channelName)) {
                    return true;
                }
            }
        }
        
        return false;
    } catch (error) {
        console.error('Failed to check channel permission:', error);
        return false;
    }
}

// Check role management permission
async function checkRoleManagementPermission(member, targetRole) {
    try {
        const userRoles = member.roles.cache.map(role => role.name.toLowerCase());
        const highestLevel = getHighestPermissionLevel(userRoles);
        
        // Owner can manage any role
        if (highestLevel === PERMISSION_LEVELS.OWNER) {
            return true;
        }
        
        // Check if user has permission through role inheritance
        for (const role of userRoles) {
            const rolePermissions = permissionCache.get(role);
            if (rolePermissions) {
                // Check default permissions
                if (rolePermissions.roles.includes('*') || rolePermissions.roles.includes(targetRole)) {
                    return true;
                }
                
                // Check custom permissions
                if (rolePermissions.custom.roles?.includes(targetRole)) {
                    return true;
                }
            }
        }
        
        return false;
    } catch (error) {
        console.error('Failed to check role management permission:', error);
        return false;
    }
}

const ROLE_HIERARCHY = {
    'T': 5,
    'Admins': 4,
    'Senior Moderators': 3,
    'Moderators': 2,
    'Helpers': 1
};

const COMMAND_PERMISSIONS = {
    'ban': ['Moderators', 'Admins', 'owner'],
    'kick': ['Moderators', 'Admins', 'owner'],
    'mute': ['Helpers', 'Moderators', 'Admins', 'owner'],
    'warn': ['Helpers', 'Moderators', 'Admins', 'owner'],
    'purge': ['Moderators', 'Admins', 'owner'],
    'lock': ['Moderators', 'Admins', 'owner'],
    'unlock': ['Moderators', 'Admins', 'owner'],
    'blacklistword': ['Senior Moderators', 'Admins', 'owner'],
    'unblacklistword': ['Senior Moderators', 'Admins', 'owner'],
    'setnick': ['Helpers', 'Moderators', 'Admins', 'owner'],
    'nickname': ['Helpers', 'Moderators', 'Admins', 'owner']
};

async function checkTargetHierarchy(interaction, targetMember) {
    const executor = interaction.member;
    const target = targetMember;

    if (!executor || !target) {
        throw new CommandError('Member or target not found', 'INVALID_TARGET');
    }

    // Check if target is the guild owner
    if (target.id === interaction.guild.ownerId) {
        throw new CommandError('Cannot moderate the server owner', 'INVALID_TARGET');
    }

    // Check if target has higher role than executor
    const executorHighestRole = executor.roles.highest.position;
    const targetHighestRole = target.roles.highest.position;

    if (targetHighestRole >= executorHighestRole) {
        throw new CommandError('Cannot moderate a member with equal or higher role', 'INVALID_TARGET');
    }

    return true;
}

/**
 * Get the hierarchy level of a member based on their roles
 */
function getHierarchyLevel(member) {
    let highest = 0;
    for (const [name, level] of Object.entries(HIERARCHY_LEVELS)) {
        if (member.roles.cache.some(r => r.name.toLowerCase() === name.toLowerCase())) {
            highest = Math.max(highest, level);
        }
    }
    return highest;
}

/**
 * Check if a user is on cooldown for a specific command
 */
function isOnCooldown(userId, command) {
    const cooldown = COMMAND_COOLDOWNS[command];
    if (!cooldown) return false;
    const userMap = userCooldowns.get(userId);
    if (!userMap) return false;
    const last = userMap.get(command);
    if (!last) return false;
    return (Date.now() - last) < cooldown;
}

/**
 * Set a cooldown for a user's command
 */
function setCooldown(userId, command) {
    const cooldown = COMMAND_COOLDOWNS[command];
    if (!cooldown) return;
    let userMap = userCooldowns.get(userId);
    if (!userMap) {
        userMap = new Map();
        userCooldowns.set(userId, userMap);
    }
    userMap.set(command, Date.now());
}

/**
 * Get remaining cooldown time for a command
 */
function getCooldownTime(userId, command) {
    const cooldown = COMMAND_COOLDOWNS[command];
    if (!cooldown) return 0;
    const userMap = userCooldowns.get(userId);
    if (!userMap) return 0;
    const last = userMap.get(command);
    if (!last) return 0;
    const diff = cooldown - (Date.now() - last);
    return diff > 0 ? diff : 0;
}

/**
 * Check if a member has a specific Discord permission
 */
function hasPermission(member, permission) {
    return member.permissions.has(permission);
}

/**
 * Get all Discord permissions a member has
 */
function getMemberPermissions(member) {
    return Object.keys(PermissionsBitField.Flags).filter(flag =>
        member.permissions.has(flag)
    );
}

// Add a function to ensure permission checking is consistent
async function checkModerationPermission(interaction, requiredRole) {
    try {
        // First try to use the commandHelpers version which has more detailed role checking
        const { checkModerationPermission: helperCheck } = require('./commandHelpers');
        if (typeof helperCheck === 'function') {
            return helperCheck(interaction, requiredRole);
        }
        
        // Fall back to our own implementation
        const member = interaction.member;
        if (!member) return false;
        
        // Always allow owner
        if (member.id === interaction.guild.ownerId) return true;
        
        // Always allow administrators
        if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
        
        const requiredLevel = getRequiredLevel(requiredRole);
        const memberLevel = getHierarchyLevel(member);
        
        return memberLevel >= requiredLevel;
    } catch (error) {
        console.error('Error in checkModerationPermission:', error);
        return false;
    }
}

// Helper function to map role name to hierarchy level
function getRequiredLevel(roleName) {
    const normalizedRole = roleName.toLowerCase().trim();
    
    if (normalizedRole === 't') {
        return 6;
    } else if (normalizedRole === 'admins') {
        return 5;
    } else if (normalizedRole === 'senior moderators') {
        return 4;
    } else if (normalizedRole === 'moderators') {
        return 3;
    } else if (normalizedRole === 'helpers') {
        return 2;
    } else if (normalizedRole === 'trial helpers') {
        return 1;
    }
    
    return 0;
}

/**
 * Check if a user has permission to post GIFs
 * This directly uses the Level 25 role ID rather than searching by name
 */
async function checkGifPermission(member, channelName = null) {
    try {
        if (!member) {
            console.log('[GIF Permission] No member object provided');
            return false;
        }
        
        // Staff bypass - these roles can always post GIFs
        const staffRoles = ['Admin', 'Admins', 'Mod', 'Mods', 'Helper', 'Helpers', 'T'];
        const hasStaffRole = member.roles.cache.some(role => 
            staffRoles.includes(role.name));
            
        if (hasStaffRole) {
            console.log(`[GIF Permission] ${member.user.tag} has staff role, allowing GIF`);
            return true;
        }
        
        // Check for No GIFs role - this always blocks regardless of level
        // Use the exact role ID instead of searching by name
        const NO_GIFS_ROLE_ID = '1370134955832770580';
        if (member.roles.cache.has(NO_GIFS_ROLE_ID)) {
            console.log(`[GIF Permission] ${member.user.tag} has No GIFs role (ID: ${NO_GIFS_ROLE_ID}), blocking GIF`);
            return false;
        }
        
        // Check for Level 25 role using the exact ID
        const LEVEL_25_ROLE_ID = '1066909500210151555';
        const hasLevel25 = member.roles.cache.has(LEVEL_25_ROLE_ID);
        
        // Always allow Level 25+ users in general chat - handle both channel name formats
        if (channelName && typeof channelName === 'string') {
            const lowercaseChannelName = channelName.toLowerCase();
            const isGeneralChat = lowercaseChannelName === '💬」general' || 
                                 lowercaseChannelName === '💬」general-chat';
                                 
            if (isGeneralChat && hasLevel25) {
                console.log(`[GIF Permission] Allowing Level 25 user ${member.user.tag} to post GIFs in general chat`);
                return true;
            }
        }
        
        console.log(`[GIF Permission] ${member.user.tag} Level 25 role check: ${hasLevel25}`);
        return hasLevel25;
    } catch (error) {
        console.error('Error in checkGifPermission:', error);
        return false;
    }
}

module.exports = {
    initializePermissionManager,
    checkCommandPermission,
    checkChannelPermission,
    checkRoleManagementPermission,
    updateRolePermissions,
    getRolePermissions,
    PERMISSION_LEVELS,
    DEFAULT_ROLE_PERMISSIONS,
    ROLE_HIERARCHY,
    COMMAND_PERMISSIONS,
    checkTargetHierarchy,
    getHierarchyLevel,
    isOnCooldown,
    setCooldown,
    getCooldownTime,
    hasPermission,
    getMemberPermissions,
    checkModerationPermission,
    checkGifPermission
}; 
