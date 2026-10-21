/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports = {};
  vm.runInNewContext(js,{exports,require: name => { if (!(name in mocks)) throw Error(name); return mocks[name]; }});
  return exports;
}
const validation = load('src/utils/report-validation.ts');
const copy = load('src/constants/reports-copy.ts');
const {validateReport, reportLength, normalizeReportText, reportLimits, reportMinimum} = validation;
const valid = kind => ({kind, title:'a'.repeat(5), description:'a'.repeat(20), target:kind==='content'?'abc':'', steps:kind==='bug'?'a'.repeat(10):'', expected:'', consent:true});
let cases = 0;
for (const kind of ['bug','content']) {
  assert.equal(Object.keys(validateReport(valid(kind))).length,0);
  for (const field of Object.keys(reportLimits)) {
    if(kind==='content' && ['steps','expected'].includes(field)) continue;
    const min=reportMinimum(field,kind), max=reportLimits[field];
    for(const character of ['a','中','あ','😀']) {
      for(const count of new Set([0,Math.max(0,min-1),min,max,max+1])) {
        const value=' \u0085'+character.repeat(count)+'\u3000 ';
        const issue=validateReport({...valid(kind),[field]:value})[field];
        assert.equal(issue, min && !count?'required':count<min?'short':count>max?'long':undefined);
        assert.equal(reportLength(value),count); cases++;
      }
    }
  }
  assert.equal(validateReport({...valid(kind),consent:false}).consent,'required');
}
assert.equal(reportLength('\ufeffabc\ufeff'),5); // Pydantic preserves BOM.
assert.equal(normalizeReportText(' \u3000中\u3000 '),'中');
assert.equal(reportLength('\u001cabc\u001c'),5); // Pydantic preserves these controls.
assert.equal(reportLength('e\u0301'),2); // Backend counts code points, not graphemes.
assert.equal(validateReport({...valid('content'),steps:'x'.repeat(2001),expected:'x'.repeat(1001)}).steps,undefined);
// Render the real screen with deterministic hook/host mocks; exercise its actual handlers.
let state=[], cursor=0, submitted=0, uuidCalls=0, lang='zh-TW';
const jsx=(type,props)=> typeof type==='function'?type(props):({type,props:props||{}});
const react={useState: initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},useRef:initial=>{const i=cursor++;return state[i]||(state[i]={current:initial});}};
const hosts=Object.fromEntries(['ActivityIndicator','KeyboardAvoidingView','Pressable','Switch','Text','TextInput','View'].map(name=>[name,name]));
const screen=load('src/app/reports.tsx',{
 'react':react,'react/jsx-runtime':{jsx,jsxs:jsx},
 'react-native':{...hosts,Platform:{OS:'android',Version:35},StyleSheet:{create:x=>x}},
 'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'expo-router':{router:{replace:()=>{}}},
 'expo-crypto':{randomUUID:()=>{uuidCalls++;return 'test-id';}},'expo-constants':{default:{expoConfig:{version:'1'}}},
 'react-i18next':{useTranslation:()=>({i18n:{language:lang,resolvedLanguage:lang}})},
 '@/components/rose-scroll-view':{default:'ScrollView'},'@/constants/fan-theme':{FanColors:{}},
 '@/constants/reports-copy':copy,'@/utils/report-validation':validation,
 '@/services/reports-api':{ReportError:class extends Error{},listReports:async()=>[],submitReport:async()=>{submitted++;return {id:'case',status:'received'};}},
}).default;
let tree;
function render(){cursor=0;tree=screen();return tree;}
function all(node){if(Array.isArray(node))return node.flatMap(n=>all(n));if(!node||typeof node!=='object')return [];return [node,...all(node.props?.children)];}
function text(node){if(Array.isArray(node))return node.map(text).join('');if(typeof node==='string'||typeof node==='number')return String(node);return node&&typeof node==='object'?text(node.props?.children):'';}
function button(label){return all(tree).find(n=>n.type==='Pressable'&&text(n)===label);}
function input(field){const label=copy.reportsCopy(lang)[field];return all(tree).find(n=>n.type==='TextInput'&&n.props.accessibilityLabel.startsWith(label));}
for(lang of ['zh-TW','en','ja']) {
 for(const kind of ['bug','content']) {
  state=[];render(); const c=copy.reportsCopy(lang);
  if(kind==='content'){button(c.content).props.onPress();render();}
  const before=uuidCalls;button(c.review).props.onPress();render();
  assert.equal(uuidCalls,before);assert.equal(button(c.confirm),undefined);
  assert.ok(all(tree).some(n=>n.props.accessibilityRole==='alert'&&text(n)===c.validation.empty));
  assert.ok(text(tree).includes(c.category+' *'));
  for(const [field,value] of Object.entries(valid(kind))) {
   if(['kind','consent'].includes(field)||kind==='content'&&['steps','expected'].includes(field))continue;
   input(field).props.onChangeText(value);render();
  }
  all(tree).find(n=>n.type==='Switch').props.onValueChange(true);render();
  input('title').props.onChangeText('😀'.repeat(121));render();
  assert.equal(input('title').props['aria-invalid'],true);
  button(c.review).props.onPress();render();assert.equal(button(c.confirm),undefined);
  input('title').props.onChangeText(' 😀'.trim().repeat(120));render();
  assert.equal(input('title').props['aria-invalid'],false);
  button(c.review).props.onPress();render();assert.ok(button(c.confirm));
  button(c.edit).props.onPress();render();assert.equal(input('title').props.value,'😀'.repeat(120));
  assert.ok(text(tree).includes(c.records));
 }
}
assert.equal(submitted,0);
async function submissionChecks() {
 for (lang of ['zh-TW', 'en', 'ja']) {
  for (const kind of ['bug', 'content']) {
   state=[];render(); const c=copy.reportsCopy(lang);
   state[8]={...valid(kind), title:'bad', request_id:'test-id', category:'other', environment:'test'};render();
   const before=submitted;button(c.confirm).props.onPress();await new Promise(resolve => setImmediate(resolve));render();
   assert.equal(submitted,before);assert.equal(button(c.confirm),undefined);
   state[8]={...valid(kind), request_id:'test-id', category:'other', environment:'test'};render();
   button(c.confirm).props.onPress();await new Promise(resolve => setImmediate(resolve));render();
   assert.equal(submitted,before+1);assert.ok(text(tree).includes(c.received));
   button(c.next).props.onPress();render();assert.equal(input('title').props.value,'');
  }
 }
 console.log('PASS: submission guard, valid submission and reset for both kinds in three languages.');
}
submissionChecks().catch(error => {console.error(error);process.exitCode=1;});
console.log('PASS: '+cases+' Unicode/length boundaries; consent; hidden fields; real screen handlers for both kinds in zh/en/ja; invalid review blocking, correction, edit preservation and records.');
