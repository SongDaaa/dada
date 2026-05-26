// dada-admin.js — Admin panel
// Dependencies: dada-auth.js (authToken, API_BASE, currentUser)

function loadAdminUsers() {
  if (!currentUser || !currentUser.is_admin) {
    document.getElementById('adminContent').innerHTML = '<p style="text-align:center;color:var(--sub);padding:40px;">需要管理员权限</p>';
    return;
  }
  fetch(API_BASE + '/api/admin/users', {
    headers: { 'Authorization': 'Bearer ' + authToken }
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.error) { toast(data.error); return; }
    renderAdminTable(data.users);
  })
  .catch(function(e) {
    document.getElementById('adminContent').innerHTML = '<p style="text-align:center;color:#d44;padding:40px;">加载失败：' + e.message + '</p>';
  });
}

function renderAdminTable(users) {
  var html = '<table class="word-table" style="margin-top:12px;">' +
    '<thead><tr><th>ID</th><th>用户名</th><th>单词数</th><th>学习天数</th><th>已学单词</th><th>打卡连续</th><th>学习连续</th><th>注册时间</th><th>角色</th></tr></thead><tbody>';

  users.forEach(function(u) {
    var role = u.is_admin ? '👑 管理员' : '用户';
    html += '<tr>' +
      '<td>' + u.id + '</td>' +
      '<td><b>' + escHtml(u.username) + '</b></td>' +
      '<td>' + u.word_count + '</td>' +
      '<td>' + (u.totalStudyDays || 0) + '</td>' +
      '<td>' + (u.wordsStudied || 0) + '</td>' +
      '<td>' + (u.checkInStreak || 0) + '天</td>' +
      '<td>' + (u.streak || 0) + '天</td>' +
      '<td style="font-size:11px;color:var(--sub);">' + (u.created_at || '') + '</td>' +
      '<td>' + role + '</td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  html += '<p style="text-align:center;color:var(--sub);font-size:12px;margin-top:8px;">共 ' + users.length + ' 位用户</p>';
  document.getElementById('adminContent').innerHTML = html;
}
