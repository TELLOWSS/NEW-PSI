import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateFollowup,overdue,FOLLOWUP_STATES} from '../lib/inspector/localFollowup.mjs';
const entry={status:'pending',at:'2026-10-30T12:00:00.000Z',note:'임시 출입 통제',assignee:'',dueDate:''};
const followup={status:'pending',assignee:'',dueDate:'',history:[entry]};
test('미지정 담당자와 기한으로 미조치를 기록한다',()=>{assert.equal(validateFollowup(followup),true);assert.equal(overdue(followup,new Date(2026,10,4)),false);});
test('모든 조치 상태를 보존하고 완료 상태는 기한 초과에서 제외한다',()=>{for(const status of FOLLOWUP_STATES)assert.equal(validateFollowup({...followup,status}),true);assert.equal(overdue({...followup,dueDate:'2026-10-30'},new Date(2026,10,1)),true);assert.equal(overdue({...followup,status:'verified',dueDate:'2026-10-30'},new Date(2026,10,1)),false);});
test('손상된 상태와 잘못된 날짜, 과도한 이력을 거부한다',()=>{assert.equal(validateFollowup({...followup,status:'unknown'}),false);assert.equal(validateFollowup({...followup,dueDate:'2026-02-30'}),false);assert.equal(validateFollowup({...followup,history:Array(501).fill(entry)}),false);});
