import { db, now, migrate } from './db.js';
import { CATEGORIES } from './config.js';
import { hashPassword } from './auth.js';
import { createPost } from './posts.js';
import { addComment, toggleLike } from './features.js';

const DEMO_PASSWORD = 'yetan123';

const USERS = [
  { username: '守夜人', alias: '守夜人', admin: 1 },
  { username: 'vivi', alias: '阿维', admin: 0 },
  { username: 'laozhou', alias: '老周', admin: 0 },
  { username: 'qiuqiu', alias: '秋秋', admin: 0 },
  { username: 'anon_dao', alias: '刀客', admin: 0 },
  { username: 'night_bus', alias: '末班车', admin: 0 },
];

const POSTS = [
  {
    u: 'vivi', c: 'haunt', anon: 0, loc: '广州·越秀区', at: '2023 年冬天',
    title: '出租屋的走廊每天晚上会多出一扇门',
    body: `2019 年我在广州越秀租过一个老小区七楼的一居室，楼梯间没灯，进门要摸黑数台阶。

住进去第三个星期，我开始发现一件很规律的事：十一点之后，走廊尽头会多出一扇门。它在我进门方向的右手边，金属的防盗门，门框是那种老式的黄铜色，门缝里透着一点黄光。白天我从同一个角度看过，那个位置只有一面贴了瓷砖的墙。

第一次我以为自己记错了，站在门前面数了门牌，然后回头看，门上没有号。回身再看，门还在。我抬手敲了两下，里面很安静，过了差不多三秒，有人从里面也敲了两下，位置跟我刚才敲的一模一样。

我没有开门。回屋把所有灯打开，坐到天亮。天一亮我出门去看，墙是墙，瓷砖缝里有灰，什么都没有。

后来我试着做记录：手机架在门口录像。录了七个晚上，有五个晚上录到了那扇门，另外两个晚上没有。奇怪的是录像里那扇门出现的位置每天都在往我房间的方向挪一点点——第二晚离尽头大概三米，第七晚已经快到我家门口了。

我搬走了。押金没退，房东在电话里问我："是不是又看到门了？"

我没回话，直接挂了。

如果你也遇到过类似的情况，特别是那扇门会"移动"的说法，我想知道是不是只有我一个人觉得这不是幻觉。`,
  },
  {
    u: 'laozhou', c: 'dream', anon: 1, loc: '内江', at: '2008 年夏天',
    title: '外婆去世那天，我在梦里提前一天看见了葬礼',
    body: `外婆是 2008 年夏天走的，心梗，走得很突然。

她走的前一天晚上，我做了个梦。梦里我站在一个很小的院子里，院坝是水泥地，正中间摆着一口棺材，棺材盖没有合上，边上有七八个人在忙。我能清楚地看到停放在旁边的一把竹椅，椅子背上有块磨掉了漆的地方。我还看到一个穿灰褂子的男人在给纸钱捆绳，他打结的手法很特别——绳子绕三圈，最后一圈从里面扣出来。

第二天中午，我妈给我打来电话。我赶回内江，进院子的时候整个人是僵的：院子、棺材、竹椅、连背上的掉漆位置都一样。那个穿灰褂子的男人站在墙角捆纸钱，手法跟梦里一模一样。

我从来没有去过这个院子，那是外婆老家，我上一次去还是五岁。

后来我想过很多次这件事应该怎么解释。最合理的说法可能是：我在五岁那年见过这个院子，记忆被压缩成了梦的形状；或者我妈前一天晚上打电话时语气不对，我在潜意识里已经在排练一个葬礼。

但有一件事我解释不了。梦里棺材旁边放了一双女式的黑布鞋，鞋尖朝里。现实里这双鞋是真的存在的，就放在那儿。家里人说是外婆自己前一年就准备好的，只有她和外公知道放在哪个柜子。

外婆没有告诉过任何人。我梦里为什么会知道。`,
  },
  {
    u: 'qiuqiu', c: 'fengshui', anon: 0, loc: '杭州·西湖区', at: '去年',
    title: '搬家三个月一直生病，最后发现问题在床头上方的梁',
    body: `去年换房，租了一套 90 年代的老房子，二楼，采光很好，租金便宜得不太正常。

搬进来第一个月开始，我几乎每个月都要去医院一次：先是连续四十多天的低烧，好了之后是腰痛，再然后是失眠，每天都睡到三点多就自然醒，然后就再也睡不着。

我去医院查过，指标都是正常的。医生说是压力大。可那段时间我工作反而比之前轻松。

我妈比较信这个，硬拉我去见了一个人。对方没有进门，站在门口指了指我床头，说"上面有梁"。我抬头看了一下，床头正上方确实有一根横梁，是那种比较粗的承重梁，装修的时候做了吊顶，不抬头不太注意。

他给了两条很简单的要求：一是床头不要正对梁下，二是床不要对门。都是很常见的说法，不用做任何仪式。

我照做了，把床掉了个方向，床头靠到另一面墙。之后一个月低烧没有再复发，睡眠大概花了两周慢慢恢复。

我说不清是床位的问题还是"心理暗示"的作用，但只有两件事我确定：第一，我确实听人劝把床挪了；第二，我确实好了。

我不打算宣传任何东西。只有一句：如果换个家具位置对你来说成本很低，可以试试，但不要为了这个去找人做大额的法事，先看医生。`,
  },
  {
    u: 'night_bus', c: 'deja', anon: 1, loc: '上海·静安区', at: '2024 年 3 月',
    title: '末班地铁上，有个女孩问我到哪一站下，第二天我知道了原因',
    body: `3 月的最后一个周五，我加班到十一点半，坐 2 号线的末班车。

车厢里人不多，一个女孩坐在我对面，穿米色的外套。她在静安寺站之前问我："你到哪一站下？"

我说了终点站名。她点了一下头，说："那我跟你同一站。"

一路上她没有再说话，我也戴着耳机。下车的时候她跟我一起走到出口，然后往反方向走了。

周日早上，我刷到一个本地新闻：周五晚上一个 20 多岁的女生在某站附近出事，通报里没有写名字，但配的现场图里，地上的外套是米色的。

我盯着那张图看了很久。那个路口离她说"往反方向走"的方向两百米。

我不知道她是不是那个人。我也不知道如果当时我问一句、或者陪她走到路口，会不会不一样。

我到现在还会经过那个站。每次都会看对面有没有穿米色外套的人。`,
  },
  {
    u: 'anon_dao', c: 'ritual', anon: 1, loc: '泉州', at: '小时候',
    title: '奶奶家的米缸，每年有一晚不能开',
    body: `我奶奶是泉州人，家里有个青瓷米缸，放在灶台边上。

从小她就跟我说一句话：每年农历七月十四的夜里，米缸不许开。不解释原因，只说不许。那晚她会把米面的盖子和碗都摆好，自己不再动灶台。

十岁那年我不信邪，趁她睡了自己起来舀米打算煮面。盖子掀开，米缸是满的，米面很平，像被人用手抹过。

第二天早上我起来，米面整个换了形状：中间凹下去了一个坑，坑的形状像一只手按下去的样子，五根手指都清清楚楚。

奶奶看到的时候没有骂我，只让我把灶收拾干净，然后说了一句："你奶奶的奶奶也遇到过。"

这件事一直没有解释。我后来理解成语"粒米必争"里的敬畏，可能就是从这种具体的规矩里来的。

发在这里是想问一句：有没有福建的朋友，家里也有类似的"某天不能动某样东西"的规矩？我想整理一下这些规矩背后的共同点，别在评论区吓人就行。`,
  },
  {
    u: 'vivi', c: 'ghost', anon: 0, loc: '成都·青羊区', at: '2022 年 10 月',
    title: '凌晨三点，楼下有人用一个和我一模一样的声音叫我',
    body: `2022 年 10 月，我住在成都一个临街的小区，六楼。

连续三天的凌晨三点左右，我被一声"阿维"叫醒。叫我的声音是我自己的。不是电话，不是别人模仿，就是我的声音，从窗户下面的街上飘上来，语气甚至带着我平时叫人时那种拖尾。

第一天我以为是楼上楼下谁在开玩笑，掀开窗帘看，街上空的，路灯下面一个人都没有。

第二天我留意了一下时间，2 点 58 分。第三天 3 点 01 分。

第三天我壮着胆子开窗往下看，街上还是空的。我叫了一声"谁"，对面的窗里响了一声，然后就安静了。

后来是邻居家的一条狗解决了这件事：第四天开始，那条狗每天凌晨三点前后都会对着楼下叫。叫了大概一周，声音就没有了。

不确定这两件事有没有关系。我把这段写在这里，是因为同楼层另一户也听过，他们以为是有人在放录音。`,
  },
  {
    u: 'laozhou', c: 'other', anon: 0, loc: '武汉·江岸区', at: '上个月',
    title: '老同学聚会照片里，多了一个已经去世七年的人',
    body: `上个月高中同学聚会，二十来个人，在汉口的一家馆子。

拍完大合照我发到群里，大家开始认人。有人在群里问了一句："第二排右边第三个是谁，我不记得我们班有这个人。"

我把照片放大。

第二排右边第三个的位置，是一个很瘦的男生，穿白衬衫，低着头，脸被前面人的肩膀挡住一半。我们班没有这个人。我以为是服务员或者别的桌的散客路过。

第二张照片是几秒后拍的，同一个位置，没有人。

我打电话问了班长。班长沉默了很久，说那个位置站着的是老陈。老陈七年前因为车祸走了，那年他二十四岁。他生前也是穿白衬衫，很瘦。

我手头没有任何老陈的照片，这件事是班长先提的，我没提。

发出来不是想说"鬼来了"，而是想问一句：这种合照里的"多出来的人"，有没有人有更冷静的解释？比如闪光灯、慢快门、反光、反人类的前后遮挡？我很希望能听到一个科学的说法。`,
  },
  {
    u: 'qiuqiu', c: 'dream', anon: 0, loc: '北京·海淀区', at: '最近两周',
    title: '连续十四天梦见同一间没有窗户的房间',
    body: `从两周前开始，我每天晚上都梦到同一个房间。

大约十平米，没有窗户，水泥地，左上角有个排水口，墙上有水渍。房间里只有一张铁架床，床头挂着一条发黄的毛巾。进去了出不来，也没有门，只有一扇被钉住的木板。

前三天我梦见的自己站在房间中央，后面几天开始坐在床上，最近两天我在梦里开始数墙上的水渍，一共五块。

上周我去看了一趟牙，医生问我最近有没有失眠。我说每天睡得好，只是梦有点连续。他建议我做个记录。

我把这件事写在这里，不是想找人解梦，只是想问：有没有人做过"连续剧式的梦"？后来怎么结束的？我需要一个清晰的"停止"的方法，因为我有点不敢睡了。`,
  },
];

const COMMENTS = [
  [0, 'laozhou', 0, '先说一个冷静的可能：老小区的走廊灯是声控的，有些住户会把感应灯或感应门铃装在最里面。灯一亮，你有没有可能把灯框看成了门缝的光？'],
  [0, 'night_bus', 0, '我也遇到过"走廊变长"的情况，但没到你这程度。我当时是喝了酒，所以一直不敢当真的说。'],
  [0, 'qiuqiu', 0, '录像那段我建议你保存好，别只放手机里。不是要证明什么，是给自己留个底。'],
  [0, 'vivi', 2, '录像后来丢过一次。不过你说得对，不该只放手机里。'],
  [1, 'vivi', 0, '我外婆走的时候我什么都没梦到。有段时间我很介意，觉得是不是感情不够深。后来想通了，梦不是成绩单。'],
  [1, 'anon_dao', 0, '那双鞋的事确实没法解释。不过我想补一句：很多老人确实会提前准备自己的东西，我奶奶也藏了一个木匣子，家里人都是她走了才知道。'],
  [2, 'night_bus', 0, '"换了位置就好了"是最典型的样本量不足，但也确实不值得为了这个去花大钱。你这个态度很稳。'],
  [2, 'laozhou', 0, '补充一个很实际的：九十年代的房子隔音差、霉味重、灰尘多，长期低烧和失眠也可能是屋里潮气导致的。挪床的同时你可能也改善了通风。'],
  [3, 'qiuqiu', 0, '看这段的时候我坐直了。你不需要负担任何东西，你当时什么都不知道。'],
  [3, 'anon_dao', 0, '如果难受，去找人说说话，别自己扛着。这不是玄学问题。'],
  [4, 'laozhou', 0, '福建这边确实有这个说法，但各地细节不一样。有些地方是灶上不能放东西，有些是不能动米缸。我回头问问我妈。'],
  [5, 'qiuqiu', 0, '狗叫那段让我想起我家楼下那条狗，每天凌晨都要叫。一直以为它在骂街。'],
  [6, 'night_bus', 0, '合照这个，最实用的解释顺序是：慢快门 + 路人 + 反光 + 后期压缩。你可以先看原图的 EXIF，看曝光时间是不是比较长。'],
  [6, 'vivi', 0, '原图的曝光是 1/30，二十个人并不全齐，确实有可能有人没站好。但这个位置没有人站过。'],
  [7, 'laozhou', 0, '连续梦境的停止方法我说个笨办法：醒来之后立刻把它写下来，写到细节都不重要为止。整理比压着好。'],
  [7, 'anon_dao', 0, '如果影响睡眠超过两周，去看睡眠科，这跟灵异没有关系，是身体在报警。'],
];

export async function seed({ force = false } = {}) {
  const existing = db.query('SELECT COUNT(*) AS n FROM users').get().n;
  if (existing > 0 && !force) return console.log('已存在数据，跳过种子（--force 可强制重建）');

  if (force) {
    for (const t of ['notifications', 'reports', 'bookmarks', 'likes', 'tags', 'attachments', 'comments', 'posts', 'sessions', 'users']) {
      db.query(`DELETE FROM ${t}`).run();
    }
  }

  const hash = await hashPassword(DEMO_PASSWORD);
  const ids = {};
  let t = now() - 1000 * 60 * 60 * 24 * 60;
  for (const u of USERS) {
    const r = db
      .query('INSERT INTO users (username, alias, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(u.username, u.alias, hash, u.admin, t);
    ids[u.username] = Number(r.lastInsertRowid);
    t += 1000 * 60 * 30;
  }

  const postIds = [];
  for (let i = 0; i < POSTS.length; i++) {
    const p = POSTS[i];
    const user = db.query('SELECT * FROM users WHERE id = ?').get(ids[p.u]);
    const { id } = createPost(user, { ...p, anonymous: !!p.anon });
    postIds.push(id);
    // 打散创建时间，让信息流有层次
    const ts = now() - (POSTS.length - i) * 1000 * 60 * 60 * (5 + ((i * 7) % 9));
    db.query('UPDATE posts SET created_at = ?, views = ? WHERE id = ?').run(ts, 40 + ((i * 137) % 900), id);
  }

  let ct = now() - 1000 * 60 * 60 * 30;
  for (const [pi, who, parentIdx, body] of COMMENTS) {
    const postId = postIds[pi];
    if (!postId) continue;
    const user = db.query('SELECT * FROM users WHERE id = ?').get(ids[who]);
    let parentId = null;
    if (parentIdx) {
      const row = db.query("SELECT id FROM comments WHERE post_id = ? AND status = 'published' ORDER BY id").all(postId);
      parentId = row[parentIdx - 1]?.id ?? null;
    }
    db.query('INSERT INTO comments (post_id, user_id, parent_id, body, anonymous, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      postId, ids[who], parentId, body, who !== 'vivi' && who !== 'laozhou' ? 1 : 0, ct
    );
    ct += 1000 * 60 * 17;
    db.query('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?').run(postId);
  }

  // 随机的赞，制造"热度"
  const rnd = (n) => Math.floor(Math.random() * n);
  for (const postId of postIds) {
    const users = Object.values(ids);
    const picks = users.filter(() => Math.random() < 0.6);
    for (const uid of picks) {
      db.query('INSERT OR IGNORE INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)').run(uid, postId, now() - rnd(1e8));
    }
    db.query('UPDATE posts SET like_count = (SELECT COUNT(*) FROM likes WHERE post_id = ?) WHERE id = ?').run(postId, postId);
  }

  console.log(`种子完成：${Object.keys(ids).length} 个用户，${postIds.length} 篇帖子，${COMMENTS.length} 条评论`);
  console.log(`登录密码统一为：${DEMO_PASSWORD}（管理员：守夜人）`);
}

if (import.meta.main) {
  migrate();
  await seed({ force: process.argv.includes('--force') });
  console.log('分类：', CATEGORIES.map((c) => c.name).join(' / '));
}
