// Network packet types

const PacketTypes = {
    // Client -> Server
    C_JOIN: 'c_join',
    C_LOGIN: 'c_login',
    C_REGISTER: 'c_register',
    C_GUEST_LOGIN: 'c_guest_login',
    C_MOVE: 'c_move',
    C_HIT_BLOCK: 'c_hit',
    C_PLACE_BLOCK: 'c_place',
    C_CHAT: 'c_chat',
    C_ENTER_WORLD: 'c_enter_world',
    C_TRADE_REQUEST: 'c_trade_req',
    C_TRADE_ADD: 'c_trade_add',
    C_TRADE_LOCK: 'c_trade_lock',
    C_TRADE_ACCEPT: 'c_trade_accept',
    C_TRADE_CANCEL: 'c_trade_cancel',
    C_SIGN_EDIT: 'c_sign_edit',
    C_LOCK_ACCESS: 'c_lock_access',
    C_BUY_ITEM: 'c_buy_item',
    C_WRENCH: 'c_wrench',

    // Server -> Client
    S_JOIN_OK: 's_join_ok',
    S_LOGIN_FAIL: 's_login_fail',
    S_WORLD_DATA: 's_world_data',
    S_PLAYER_JOIN: 's_player_join',
    S_PLAYER_LEAVE: 's_player_leave',
    S_PLAYER_MOVE: 's_player_move',
    S_BLOCK_UPDATE: 's_block_update',
    S_INVENTORY_UPDATE: 's_inv_update',
    S_CHAT: 's_chat',
    S_GEMS_UPDATE: 's_gems',
    S_DROP_ITEM: 's_drop',
    S_TREE_UPDATE: 's_tree',
    S_LOCK_EFFECT: 's_lock_effect',
    S_TRADE_OPEN: 's_trade_open',
    S_TRADE_UPDATE: 's_trade_update',
    S_TRADE_COMPLETE: 's_trade_done',
    S_TRADE_CANCEL: 's_trade_cancel',
    S_ERROR: 's_error',
    S_LOCK_DATA: 's_lock_data',
    S_SERVER_STATS: 's_server_stats',
    S_SNAPSHOT: 's_snapshot',
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PacketTypes;
}
