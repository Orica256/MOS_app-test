/**
 * js/data.js
 * 居酒屋みどり亭 MOS — マスタデータ定義
 * ※ プロトタイプ用固定値。本番実装時はPHP APIから取得する。
 */

"use strict";

const MOS = window.MOS || {};

// ─────────────────────────────────────────
// コース定義
// ─────────────────────────────────────────
MOS.COURSES = [
  {
    id: "premium",
    label: "プレミアム飲み放題",
    shortLabel: "プレミアム",
    emoji: "👑",
    price: 1980,
    minutes: 120,
    color: "#c9a227",
    badge: "人気No.1",
    desc: "プレミアム銘柄含む全ドリンク飲み放題",
    includes: ["生ビール", "プレミアムハイボール", "全カクテル", "全サワー", "ソフトドリンク全種"],
  },
  {
    id: "standard",
    label: "スタンダード飲み放題",
    shortLabel: "スタンダード",
    emoji: "🍺",
    price: 1480,
    minutes: 120,
    color: "#e8621a",
    badge: "お得",
    desc: "定番ドリンク飲み放題コース",
    includes: ["生ビール", "ハイボール", "レモンサワー", "梅サワー", "ソフトドリンク全種"],
  },
  {
    id: "alacarte",
    label: "単品注文",
    shortLabel: "単品",
    emoji: "🍽️",
    price: 0,
    minutes: null,
    color: "#5c6e3a",
    badge: null,
    desc: "飲み放題なし。お好みの品を単品でご注文",
    includes: [],
  },
];

// ─────────────────────────────────────────
// カテゴリ定義
// ─────────────────────────────────────────
MOS.CATEGORIES = [
  { key: "おすすめ",   type: "food",  emoji: "⭐" },
  { key: "焼鳥",       type: "food",  emoji: "🍡" },
  { key: "おつまみ",   type: "food",  emoji: "🍗" },
  { key: "ドリンク",   type: "drink", emoji: "🍻" },
  { key: "¥0メニュー", type: "free",  emoji: "🎁" },
];

// ─────────────────────────────────────────
// メニュー定義
// ─────────────────────────────────────────
MOS.MENU = {
  "おすすめ": [
    { id:1,  name:"炭火焼鳥 盛り合わせ", price:880,  emoji:"🍢", desc:"当店自慢の炭火焼鳥5本盛り",  tag:"人気" },
    { id:2,  name:"だし巻き玉子",        price:380,  emoji:"🥚", desc:"ふわとろ職人の一品",          tag:null   },
    { id:3,  name:"瓶ビール",             price:600,  emoji:"🍺", desc:"キンキンに冷えた定番",        tag:null   },
  ],
  "焼鳥": [
    { id:4,  name:"ねぎま",   price:180, emoji:"🍡", desc:"鶏もも×ねぎ 2本", tag:"定番" },
    { id:5,  name:"かわ",     price:160, emoji:"🍗", desc:"パリパリ食感 2本", tag:null   },
    { id:6,  name:"つくね",   price:200, emoji:"🍢", desc:"特製タレで",       tag:"人気" },
    { id:7,  name:"砂肝",     price:170, emoji:"🍢", desc:"コリコリ食感",     tag:null   },
    { id:8,  name:"レバー",   price:170, emoji:"🍢", desc:"タレ推し",         tag:null   },
  ],
  "おつまみ": [
    { id:9,  name:"えだまめ",     price:300, emoji:"🫘", desc:"塩ゆで",        tag:"定番" },
    { id:10, name:"唐揚げ",       price:480, emoji:"🍗", desc:"ジューシー5個", tag:"人気" },
    { id:11, name:"ポテトフライ", price:350, emoji:"🍟", desc:"カリカリ",      tag:null   },
    { id:12, name:"冷奴",         price:280, emoji:"🫙", desc:"国産大豆豆腐",  tag:null   },
  ],
  "ドリンク": [
    { id:13, name:"生ビール",     price:500, emoji:"🍻", desc:"サッポロ黒ラベル", tag:"定番" },
    { id:14, name:"ハイボール",   price:380, emoji:"🥃", desc:"角ハイ",           tag:null   },
    { id:15, name:"レモンサワー", price:380, emoji:"🍋", desc:"さっぱり系",       tag:null   },
    { id:16, name:"梅サワー",     price:380, emoji:"🍑", desc:"甘さ控えめ",       tag:null   },
    { id:17, name:"ウーロン茶",   price:280, emoji:"🍵", desc:"ソフトドリンク",   tag:null   },
    { id:18, name:"コーラ",       price:280, emoji:"🥤", desc:"ソフトドリンク",   tag:null   },
  ],
  "¥0メニュー": [
    { id:19, name:"おしぼり追加", price:0, emoji:"🧻", desc:"無料でどうぞ",   tag:null },
    { id:20, name:"お皿交換",     price:0, emoji:"🍽️", desc:"きれいなお皿に", tag:null },
  ],
};

// 全メニューのフラット配列
MOS.ALL_ITEMS = Object.values(MOS.MENU).flat();

// ─────────────────────────────────────────
// スタッフアカウント（デモ用固定値）
// 本番では PHP セッション認証に置き換える
// ─────────────────────────────────────────
MOS.STAFF_ACCOUNTS = [
  { id:"S001", name:"田中 一郎", password:"pass1111", role:"manager", hue:28  },
  { id:"S002", name:"佐藤 花子", password:"pass2222", role:"staff",   hue:340 },
  { id:"S003", name:"鈴木 太郎", password:"pass3333", role:"staff",   hue:210 },
  { id:"S004", name:"山田 美咲", password:"pass4444", role:"staff",   hue:145 },
];

// ─────────────────────────────────────────
// billStatus定義
// ─────────────────────────────────────────
MOS.BILL_STATUS = {
  1: { label:"受付中",  color:"#22c55e" },
  2: { label:"会計済み",color:"#94a3b8" },
  4: { label:"未収金",  color:"#ef4444" },
  8: { label:"会計中",  color:"#f59e0b" },
};

// ─────────────────────────────────────────
// テーブルステータスデフォルト
// ─────────────────────────────────────────
MOS.DEFAULT_TABLE_STATUSES = [
  { id:"empty",    label:"空席",    color:"#94a3b8", fixed:true },
  { id:"occupied", label:"使用中",  color:"#e8621a", fixed:true },
  { id:"cleaning", label:"清掃中",  color:"#f59e0b", fixed:true },
  { id:"reserved", label:"予約済み",color:"#6366f1", fixed:true },
];

// ─────────────────────────────────────────
// テーブル初期データ（デモ用）
// ─────────────────────────────────────────
MOS.TABLES = [
  { id:"c1", area:"カウンター",  no:"C-1",  seats:1, status:"occupied", orderId:"ORD-001" },
  { id:"c2", area:"カウンター",  no:"C-2",  seats:1, status:"empty",    orderId:null },
  { id:"c3", area:"カウンター",  no:"C-3",  seats:1, status:"reserved", orderId:null },
  { id:"1a", area:"1F テーブル", no:"1F-1", seats:4, status:"occupied", orderId:"ORD-002" },
  { id:"1b", area:"1F テーブル", no:"1F-2", seats:4, status:"empty",    orderId:null },
  { id:"1c", area:"1F テーブル", no:"1F-3", seats:4, status:"cleaning", orderId:null },
  { id:"2a", area:"2F テーブル", no:"2F-1", seats:6, status:"occupied", orderId:"ORD-003" },
  { id:"2b", area:"2F テーブル", no:"2F-2", seats:6, status:"empty",    orderId:null },
  { id:"2c", area:"2F テーブル", no:"2F-3", seats:6, status:"empty",    orderId:null },
];

// ─────────────────────────────────────────
// 注文初期データ（デモ用）
// ─────────────────────────────────────────
MOS.SEED_ORDERS = [
  { id:"ORD-001", tableNo:"C-1",  guests:1, courseId:"alacarte", time:"19:12", status:1,
    items:[{name:"ハイボール",price:380,qty:2,served:2},{name:"つくね",price:200,qty:2,served:1}] },
  { id:"ORD-002", tableNo:"1F-1", guests:3, courseId:"standard", time:"19:45", status:1,
    items:[{name:"生ビール",price:500,qty:3,served:3},{name:"唐揚げ",price:480,qty:2,served:0},{name:"えだまめ",price:300,qty:1,served:1}] },
  { id:"ORD-003", tableNo:"2F-1", guests:5, courseId:"premium",  time:"20:10", status:8,
    items:[{name:"瓶ビール",price:600,qty:5,served:5},{name:"焼鳥盛合わせ",price:880,qty:2,served:2},{name:"ポテトフライ",price:350,qty:1,served:0}] },
];

// ─────────────────────────────────────────
// 売上データ（デモ用）
// ─────────────────────────────────────────
MOS.SALES_DATA = [
  { d:"5/7水",  s:82400,  o:18, g:42  },
  { d:"5/8木",  s:91200,  o:22, g:55  },
  { d:"5/9金",  s:143800, o:35, g:89  },
  { d:"5/10土", s:198500, o:48, g:124 },
  { d:"5/11日", s:167300, o:41, g:103 },
  { d:"5/12月", s:54200,  o:12, g:28  },
  { d:"5/13火", s:89600,  o:24, g:61  },
];

// ─────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────
MOS.fmtPrice = (p) => p === 0 ? "無料" : `¥${p.toLocaleString()}`;
MOS.fmtTime  = (d) => d.toTimeString().slice(0, 5);

let _oidCounter = 1000;
MOS.nextOid = () => `ORD-${++_oidCounter}`;

MOS.getCourse = (id) => MOS.COURSES.find(c => c.id === id) || null;
MOS.getItem   = (id) => MOS.ALL_ITEMS.find(m => m.id === Number(id)) || null;

window.MOS = MOS;
