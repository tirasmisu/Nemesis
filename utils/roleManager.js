const { EmbedBuilder } = require('discord.js');
const fs = require('fs/promises');
const path = require('path');

// Store for role persistence
const ROLE_STORAGE_PATH = path.join(__dirname, '../data/roleStorage.json');

// Role operation types
const ROLE_OPERATIONS = {
    ADD: 'add',
    REMOVE: 'remove',
    BULK_ADD: 'bulk_add',
    BULK_REMOVE: 'bulk_remove'
};

// Load role storage
async function loadRoleStorage() {
    try {
        const data = await fs.readFile(ROLE_STORAGE_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // If file doesn't exist, create it with empty structure
        await fs.writeFile(ROLE_STORAGE_PATH, JSON.stringify({
            userRoles: {},
            roleHistory: []
        }, null, 2));
        return { userRoles: {}, roleHistory: [] };
    }
}

// Save role storage
async function saveRoleStorage(storage) {
    try {
        // Save to history file (append) to maintain all changes
        const historyFile = ROLE_STORAGE_PATH.replace('.json', '_history.jsonl');
        const timestampedStorage = {
            timestamp: new Date().toISOString(),
            ...storage
        };
        await fs.appendFile(historyFile, JSON.stringify(timestampedStorage) + '\n');
        
        // Write current state to main file (overwrite is intentional for current state)
        await fs.writeFile(ROLE_STORAGE_PATH, JSON.stringify(storage, null, 2));
    } catch (error) {
        console.error('Error saving role storage:', error);
    }
}

// Add role to user with persistence
async function addRole(member, role, moderator, reason) {
    try {
        await member.roles.add(role);
        
        // Update storage
        const storage = await loadRoleStorage();
        if (!storage.userRoles[member.id]) {
            storage.userRoles[member.id] = [];
        }
        storage.userRoles[member.id].push({
            roleId: role.id,
            addedBy: moderator.id,
            timestamp: new Date().toISOString(),
            reason: reason
        });
        
        // Add to history
        storage.roleHistory.push({
            type: ROLE_OPERATIONS.ADD,
            userId: member.id,
            roleId: role.id,
            moderatorId: moderator.id,
            timestamp: new Date().toISOString(),
            reason: reason
        });
        
        await saveRoleStorage(storage);
        return true;
    } catch (error) {
        console.error('Error adding role:', error);
        return false;
    }
}

// Remove role from user with persistence
async function removeRole(member, role, moderator, reason) {
    try {
        await member.roles.remove(role);
        
        // Update storage
        const storage = await loadRoleStorage();
        if (storage.userRoles[member.id]) {
            storage.userRoles[member.id] = storage.userRoles[member.id].filter(
                r => r.roleId !== role.id
            );
        }
        
        // Add to history
        storage.roleHistory.push({
            type: ROLE_OPERATIONS.REMOVE,
            userId: member.id,
            roleId: role.id,
            moderatorId: moderator.id,
            timestamp: new Date().toISOString(),
            reason: reason
        });
        
        await saveRoleStorage(storage);
        return true;
    } catch (error) {
        console.error('Error removing role:', error);
        return false;
    }
}

// Bulk add roles to multiple users
async function bulkAddRoles(members, role, moderator, reason) {
    const results = {
        success: [],
        failed: []
    };
    
    for (const member of members) {
        const success = await addRole(member, role, moderator, reason);
        if (success) {
            results.success.push(member.id);
        } else {
            results.failed.push(member.id);
        }
    }
    
    return results;
}

// Bulk remove roles from multiple users
async function bulkRemoveRoles(members, role, moderator, reason) {
    const results = {
        success: [],
        failed: []
    };
    
    for (const member of members) {
        const success = await removeRole(member, role, moderator, reason);
        if (success) {
            results.success.push(member.id);
        } else {
            results.failed.push(member.id);
        }
    }
    
    return results;
}

// Restore roles after server restart
async function restoreRoles(guild) {
    try {
        const storage = await loadRoleStorage();
        const results = {
            success: 0,
            failed: 0
        };
        
        for (const [userId, roles] of Object.entries(storage.userRoles)) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) continue;
            
            for (const roleData of roles) {
                const role = guild.roles.cache.get(roleData.roleId);
                if (!role) continue;
                
                try {
                    await member.roles.add(role);
                    results.success++;
                } catch (error) {
                    console.error(`Failed to restore role ${role.name} for user ${member.user.tag}:`, error);
                    results.failed++;
                }
            }
        }
        
        return results;
    } catch (error) {
        console.error('Error restoring roles:', error);
        return { success: 0, failed: 0 };
    }
}

// Get role history for a user
async function getRoleHistory(userId) {
    const storage = await loadRoleStorage();
    return storage.roleHistory.filter(entry => entry.userId === userId);
}

// Create audit log embed for role operations
function createRoleAuditEmbed(operation, member, role, moderator, reason) {
    const colors = {
        [ROLE_OPERATIONS.ADD]: 0x00FF00,
        [ROLE_OPERATIONS.REMOVE]: 0xFF0000,
        [ROLE_OPERATIONS.BULK_ADD]: 0x00FF00,
        [ROLE_OPERATIONS.BULK_REMOVE]: 0xFF0000
    };

    return new EmbedBuilder()
        .setColor(colors[operation] || 0x000000)
        .setDescription(`### **Role ${operation === ROLE_OPERATIONS.ADD ? 'Added' : 'Removed'}**`)
        .addFields(
            { name: "User", value: `<@${member.id}>`, inline: true },
            { name: "Role", value: `<@&${role.id}>`, inline: true },
            { name: "Moderator", value: `<@${moderator.id}>`, inline: true },
            { name: "Reason", value: reason || "No reason provided", inline: false }
        )
        .setTimestamp();
}

module.exports = {
    ROLE_OPERATIONS,
    addRole,
    removeRole,
    bulkAddRoles,
    bulkRemoveRoles,
    restoreRoles,
    getRoleHistory,
    createRoleAuditEmbed
}; 
