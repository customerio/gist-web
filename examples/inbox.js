async function refreshInboxMessages(messages) {
    const unreadCount = await window.Gist.getInboxUnopenedCount();
    const badge = document.getElementById('inboxBadge');
    if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }

    if (!messages) {
        messages = await window.Gist.getInboxMessages();
    }

    const content = document.getElementById('inboxPanelContent');

    if (messages.length === 0) {
        content.innerHTML = '<p class="no-messages">No messages</p>';
        return;
    }

    let html = '';
    for (const message of messages) {
        const isUnread = !message.opened;
        const props = message.properties || {};
        const queueId = message.queueId;
        const propertiesJson = JSON.stringify(props, null, 2);

        html += `
        <div class="inbox-message ${isUnread ? 'unread' : ''}" data-queue-id="${queueId}">
            <div class="inbox-message-header">
            <strong>Properties</strong>
            <p>Sent at ${new Date(message.sentAt).toLocaleString()}</p>
            ${isUnread ? '<span class="unread-dot"></span>' : ''}
            </div>
            <div class="inbox-message-body">
            <pre>${propertiesJson}</pre>
            </div>
            <div class="inbox-message-actions">
            ${isUnread ? `<button onclick="markAsRead('${queueId}')">Mark as read</button>` : ''}
            <button onclick="deleteMessage('${queueId}')">Delete</button>
            </div>
        </div>
        `;
    }

    content.innerHTML = html;
}

// eslint-disable-next-line no-unused-vars
async function markAsRead(queueId) {
    try {
        await window.Gist.markInboxMessageOpened(queueId);
    } catch (error) {
        console.error('Failed to mark message as read:', error);
        alert('Failed to mark message as read. Please try again.');
    }

    await refreshInboxMessages();
}

// eslint-disable-next-line no-unused-vars
async function deleteMessage(queueId) {
    try {
        await window.Gist.removeInboxMessage(queueId);
    } catch (error) {
        console.error('Failed to delete message:', error);
        alert('Failed to delete message. Please try again.');
    }

    await refreshInboxMessages();
}

document.querySelectorAll(".toggle-inbox").forEach(element => {
    element.addEventListener("click", () => {
        const panel = document.getElementById('inboxPanel');
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
        } else {
            panel.style.display = 'none';
        }
    });
});

refreshInboxMessages();

window.Gist.events.on('messageInboxUpdated', async function(messages) {
    await refreshInboxMessages(messages);
});