// Offline follow-up data is user-entered, not a safety judgment.
export const FOLLOWUP_STATES = ['pending', 'in_progress', 'review_requested', 'needs_work', 'verified'];
export const FOLLOWUP_LABELS = {pending:'미조치', in_progress:'조치 진행 중', review_requested:'완료 확인 요청', needs_work:'보완 필요', verified:'확인 완료'};
export function validateFollowup(value) {
 if (!value || typeof value !== 'object' || !FOLLOWUP_STATES.includes(value.status)) return false;
 if (typeof value.assignee !== 'string' || value.assignee.length > 100 || typeof value.dueDate !== 'string' || (value.dueDate !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(value.dueDate) || Number.isNaN(Date.parse(value.dueDate+'T00:00:00Z')) || new Date(value.dueDate+'T00:00:00Z').toISOString().slice(0,10)!==value.dueDate))) return false;
 if (value.temporaryMeasure !== undefined && (typeof value.temporaryMeasure !== 'string' || value.temporaryMeasure.length > 1000)) return false;
 if (!Array.isArray(value.history) || value.history.length > 500) return false;
 return value.history.every(e => e && FOLLOWUP_STATES.includes(e.status) && typeof e.at === 'string' && Number.isFinite(Date.parse(e.at)) && typeof e.note === 'string' && e.note.length <= 2000 && (e.temporaryMeasure === undefined || (typeof e.temporaryMeasure === 'string' && e.temporaryMeasure.length <= 1000)) && typeof e.assignee === 'string' && e.assignee.length <= 100 && typeof e.dueDate === 'string' && (e.dueDate === '' || (/^\d{4}-\d{2}-\d{2}$/.test(e.dueDate) && !Number.isNaN(Date.parse(e.dueDate+'T00:00:00Z')) && new Date(e.dueDate+'T00:00:00Z').toISOString().slice(0,10)===e.dueDate)));
}
export function overdue(followup, now = new Date()) {
 if (!followup?.dueDate || followup.status === 'verified') return false;
 const today = [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 return followup.dueDate < today;
}

export function validateAdditionalActions(actions) {
 if (!Array.isArray(actions) || actions.length > 20) return false;
 const ids = new Set();
 return actions.every(item => {
  if (!item || typeof item.id !== 'string' || !/^[-a-f0-9]{36}$/i.test(item.id) || ids.has(item.id) || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 200) return false;
  ids.add(item.id);
  return item.followup === undefined || (validateFollowup(item.followup) && item.followup.history.length <= 50);
 });
}
