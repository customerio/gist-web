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
        const props = message.properties || {};
        const queueId = message.queueId;
        const propertiesJson = JSON.stringify(props, null, 2);

        html += `
        <div class="inbox-message ${!message.opened ? 'unopened' : ''}" data-queue-id="${queueId}">
            <div class="inbox-message-header">
            <strong>Properties</strong>
            <p>Sent at ${new Date(message.sentAt).toLocaleString()}</p>
            ${!message.opened ? '<span class="unread-dot"></span>' : ''}
            </div>
            <div class="inbox-message-body">
            <pre>${propertiesJson}</pre>
            </div>
            <div class="inbox-message-actions">
            ${!message.opened ? `<button onclick="updateInboxMessageOpenState('${queueId}',true)">Mark as opened</button>` : `<button onclick="updateInboxMessageOpenState('${queueId}',false)">Mark as unopened</button>`}
            <button onclick="deleteMessage('${queueId}')">Delete</button>
            </div>
        </div>
        `;
    }

    content.innerHTML = html;
}

// eslint-disable-next-line no-unused-vars
async function updateInboxMessageOpenState(queueId, opened) {
    try {
        await window.Gist.updateInboxMessageOpenState(queueId, opened);
    } catch (error) {
        console.error('Failed to mark message as read:', error);
        alert('Failed to mark message as read. Please try again.');
    }
}

// eslint-disable-next-line no-unused-vars
async function deleteMessage(queueId) {
    try {
        await window.Gist.removeInboxMessage(queueId);
    } catch (error) {
        console.error('Failed to delete message:', error);
        alert('Failed to delete message. Please try again.');
    }
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