/**
 * Dongchedi User Profile Replica - Interactive Logic
 */

const Shared = window.SwnbShared || {};
const escapeHtml = Shared.escapeHtml || function (str) { return String(str || ''); };

// Sample rich post dataset simulating actual posts from "我要娶一个旅行车"
const postsData = [
  {
    id: 1,
    title: "奥迪A6 Allroad 进化史：为什么它是男人的终极浪漫？",
    topic: "#旅行车改装",
    snippet: "提到旅行车（Wagon），奥迪A6 Allroad 绝对是绕不开的一台神车。既有轿车的操控与舒适，又有媲美SUV的离地间隙与通过性，再加上那性感丰满的屁股，堪称完美的自驾游利器。今天跟车友们聊聊这段时间我对台V6瓦罐的深度升级方案...",
    time: "2小时前",
    likes: 128,
    comments: 45,
    collects: 36,
    isLiked: false,
    isCollected: false,
    category: "all",
    images: [
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=600&auto=format&fit=crop&q=80"
    ],
    fullContent: `
      <p>提到旅行车（Wagon），奥迪A6 Allroad 绝对是绕不开的一台神车。既有轿车的操控与舒适，又有媲美SUV的离地间隙与通过性，再加上那性感丰满的屁股，堪称完美的自驾游利器。</p>
      <p>动力方面，搭载3.0T V6涡轮增压发动机配合48V轻混系统，最大输出340马力，匹配7速S-tronic双离合变速箱和Quattro全时四驱系统。在川西折多山垭口连续过弯时，底盘空气悬架提供的支撑性堪称完美。</p>
      <p>改装建议：</p>
      <p>1. 轮毂升级为20寸 RS6 Style 锻造轮毂，降低簧下质量；</p>
      <p>2. 贴水泥灰或者原厂哥特绿哑光车衣，质感直接拉满；</p>
      <p>3. 车顶装载拓乐（Thule）灵动系列车顶箱，瓦罐味瞬间提升100%！</p>
    `,
    commentsList: [
      { user: "瓦罐迷小张", time: "1小时前", text: "哥特绿是真的帅！梦中情车！" },
      { user: "极速追风", time: "半小时前", text: "顶箱一装，气场全开，准备年底也换一台A6 Avant！" }
    ]
  },
  {
    id: 2,
    title: "川西3000公里自驾路况实测：旅行车能不能跑非铺装路面？",
    topic: "#自驾游攻略",
    snippet: "很多人质疑旅行车走川西会不会托底，这趟从成都出发，经康定、新都桥、理塘再转向稻城亚丁。亲身体验告诉大家：只要不是极其极端的老铁马道和烂泥坑，开启Allroad升底盘模式，99%的铺装和碎石路都能轻松碾压...",
    time: "昨天 14:20",
    likes: 342,
    comments: 89,
    collects: 112,
    isLiked: true,
    isCollected: true,
    category: "liked",
    images: [
      "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=600&auto=format&fit=crop&q=80"
    ],
    fullContent: `
      <p>很多人质疑旅行车走川西会不会托底，这趟从成都出发，经康定、新都桥、理塘再转向稻城亚丁。亲身体验告诉大家：只要不是极其极端的老铁马道和烂泥坑，开启Allroad升底盘模式，99%的铺装和碎石路都能轻松碾压。</p>
      <p>沿途加注95号汽油完全没有问题，高海拔地区空气稀薄，但3.0T增压动力衰减极小，超车依旧游刃有余。</p>
      <p>重点提醒：川西暗冰较多，建议出发前务必检查胎压和刹车片厚度，随身携带防滑链应急。</p>
    `,
    commentsList: [
      { user: "在路上行者", time: "22小时前", text: "感谢干货分享，下周正打算带老婆去新都桥！" },
      { user: "改装达人磊子", time: "15小时前", text: "空气悬架升高后通过性比一般的城市SUV还好。" }
    ]
  },
  {
    id: 3,
    title: "选修还是买新？沃尔沃V60与宝马3系 touring 深度对比试驾",
    topic: "#懂车帝测评",
    snippet: "在这两个豪华品牌中型瓦罐里纠结了整整一个月。沃尔沃V60拥有最纯正北欧侧颜与环保安全座舱；宝马3系Touring虽然目前国内主要靠平行进口或老款车源，但纯粹的后驱操控乐趣确实令人着迷。最终我为什么没有选择它们？...",
    time: "06-25",
    likes: 95,
    comments: 31,
    collects: 19,
    isLiked: false,
    isCollected: false,
    category: "all",
    images: [
      "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1617788138017-80ad40651399?w=600&auto=format&fit=crop&q=80"
    ],
    fullContent: `
      <p>在这两个豪华品牌中型瓦罐里纠结了整整一个月。沃尔沃V60拥有最纯正北欧侧颜与环保安全座舱；宝马3系Touring虽然目前国内主要靠平行进口或老款车源，但纯粹的后驱操控乐趣确实令人着迷。</p>
      <p>沃尔沃V60的优点在于宝华韦健Bowers & Wilkins音响绝对是同级别天花板，听一首蔡琴直接陶醉。但底盘调校偏硬，后排乘坐舒适度略有欠缺。</p>
      <p>最终还是为了追求空间和六缸动力，直接一步到位上了C级瓦罐。</p>
    `,
    commentsList: [
      { user: "北欧幽灵", time: "06-25 18:30", text: "宝华韦健真的无敌，试听过一次再也听不下别的车机音响了。" }
    ]
  },
  {
    id: 4,
    title: "洗车治愈强迫症：两小时精洗车身PA预洗与镀膜避坑指南",
    topic: "#爱车日常",
    snippet: "作为一台颜值至上的旅行车，保持漆面光泽度是日常修行。分享一套个人自用的美光金装洗车液 + 软水PA泡沫壶预洗流派，有效避免太阳纹和漆面氧化...",
    time: "06-18",
    likes: 210,
    comments: 54,
    collects: 88,
    isLiked: true,
    isCollected: false,
    category: "liked",
    images: [
      "https://images.unsplash.com/photo-1607853202273-797f1c22a38e?w=600&auto=format&fit=crop&q=80"
    ],
    fullContent: `
      <p>作为一台颜值至上的旅行车，保持漆面光泽度是日常修行。分享一套个人自用的美光金装洗车液 + 软水PA泡沫壶预洗流派，有效避免太阳纹和漆面氧化。</p>
      <p>核心步骤：先干车喷PA泡沫溶解泥沙，高压水枪冲洗后，再采用两桶水洗车法配合超细纤维羊皮手套擦拭，最后上蜡或快喷水蜡收水亮光。</p>
    `,
    commentsList: [
      { user: "撸车狂魔", time: "06-18 21:10", text: "同款PA洗车手法，看着丰富的白色泡沫流挂真的极度舒适！" }
    ]
  },
  {
    id: 5,
    title: "深夜聊车：为什么欧洲人那么钟爱旅行车，国内却是小众狂欢？",
    topic: "#DCD飞驰计划",
    snippet: "在欧洲街头，不管是大众帕萨特Variant、奔驰C-Estate还是斯柯达明锐Combi，占有率几乎撑起半边天。因为欧洲生活场景重视周末郊游、携带滑雪板和宠物犬。随着国内露营和户外文化的蓬勃发展，瓦罐的春天还在路上吗？...",
    time: "06-10",
    likes: 512,
    comments: 168,
    collects: 205,
    isLiked: false,
    isCollected: true,
    category: "all",
    images: [
      "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=600&auto=format&fit=crop&q=80"
    ],
    fullContent: `
      <p>在欧洲街头，不管是大众帕萨特Variant、奔驰C-Estate还是斯柯达明锐Combi，占有率几乎撑起半边天。因为欧洲生活场景重视周末郊游、携带滑雪板和宠物犬。</p>
      <p>国内早年因为三厢轿车等于“官车、大气”的传统思想，加上SUV车型的强势崛起，挤压了旅行车的生存空间。但如今Z世代和年轻中产崛起，追求个性表达与高品质休闲体验，旅行车已经不仅是一辆交通工具，更代表一种优雅自由的生活态度。</p>
    `,
    commentsList: [
      { user: "自由风尚", time: "06-11 09:12", text: "说到了心坎里！瓦罐承载的不仅是行李，更是一家人的诗和远方。" },
      { user: "车轮不息", time: "06-10 23:45", text: "现在蔚来ET5T等国产新能源瓦罐也超火，旅行车文化真的越来越好了！" }
    ]
  }
];

let currentFilter = 'all';
let activePostId = null;

// Render posts based on filter
function renderFeed() {
  const feedContainer = document.getElementById('feedList');
  if (!feedContainer) return;

  const filtered = postsData.filter(p => {
    if (currentFilter === 'liked') return p.isLiked;
    return true;
  });

  if (filtered.length === 0) {
    feedContainer.innerHTML = `
      <div style="text-align: center; padding: 60px 0; color: #86909c;">
        <div style="font-size: 48px; margin-bottom: 12px;">🚗</div>
        <p>暂无相关帖子内容</p>
      </div>
    `;
    return;
  }

  feedContainer.innerHTML = filtered.map(post => `
    <div class="post-card" onclick="openArticleModal(${post.id})">
      <div class="post-header">
        <div class="post-author">
          <img src="https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=100&auto=format&fit=crop&q=80" class="avatar-small" alt="头像">
          <span class="author-name">我要娶一个旅行车</span>
        </div>
        <span class="follow-status">已关注</span>
      </div>
      <h3 class="post-title">${escapeHtml(post.title)}</h3>
      <div class="post-content">
        <span class="topic-tag">${escapeHtml(post.topic)}</span>${escapeHtml(post.snippet)}
      </div>
      ${post.images && post.images.length > 0 ? `
        <div class="post-images">
          ${post.images.map(img => `<img src="${img}" class="post-img" alt="配图">`).join('')}
        </div>
      ` : ''}
      <div class="post-footer">
        <span class="post-time">${post.time}</span>
        <div class="post-actions" onclick="event.stopPropagation()">
          <button class="action-btn" onclick="toggleComment(${post.id})">
            <span>💬</span> <span>${post.comments}</span>
          </button>
          <button class="action-btn ${post.isLiked ? 'active' : ''}" onclick="toggleLike(${post.id})">
            <span>${post.isLiked ? '❤️' : '🤍'}</span> <span>${post.likes}</span>
          </button>
          <button class="action-btn ${post.isCollected ? 'active' : ''}" onclick="toggleCollect(${post.id})">
            <span>${post.isCollected ? '⭐' : '☆'}</span> <span>${post.collects}</span>
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

// Switch Tab
function switchTab(tabName) {
  currentFilter = tabName;
  document.querySelectorAll('.tab-item').forEach(el => {
    el.classList.remove('active');
    if (el.dataset.tab === tabName) {
      el.classList.add('active');
    }
  });
  renderFeed();
}

// Toggle Like
function toggleLike(id) {
  const post = postsData.find(p => p.id === id);
  if (post) {
    post.isLiked = !post.isLiked;
    post.likes += post.isLiked ? 1 : -1;
    renderFeed();
    if (activePostId === id) renderModalDetails(post);
  }
}

// Toggle Collect
function toggleCollect(id) {
  const post = postsData.find(p => p.id === id);
  if (post) {
    post.isCollected = !post.isCollected;
    post.collects += post.isCollected ? 1 : -1;
    renderFeed();
    if (activePostId === id) renderModalDetails(post);
  }
}

// Toggle Comment (Scroll / Focus in modal)
function toggleComment(id) {
  openArticleModal(id);
  setTimeout(() => {
    const input = document.getElementById('newCommentInput');
    if (input) input.focus();
  }, 300);
}

// Open Article Modal (Interactive Detail View)
function openArticleModal(id) {
  const post = postsData.find(p => p.id === id);
  if (!post) return;
  activePostId = id;
  renderModalDetails(post);
  document.getElementById('articleModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

// Close Article Modal
function closeArticleModal() {
  document.getElementById('articleModal').classList.remove('active');
  document.body.style.overflow = '';
  activePostId = null;
}

// Render Modal Details
function renderModalDetails(post) {
  const modalBody = document.getElementById('modalBodyContent');
  modalBody.innerHTML = `
    <div class="article-title">${escapeHtml(post.title)}</div>
    <div class="article-meta">
      <div class="post-author" style="gap: 12px;">
        <img src="https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=100&auto=format&fit=crop&q=80" style="width:36px;height:36px;border-radius:50%;" alt="头像">
        <div>
          <div style="font-weight:700;color:#1f2329;">我要娶一个旅行车</div>
          <div style="font-size:12px;color:#86909c;">发布于 ${escapeHtml(post.time)} · ${escapeHtml(post.topic)}</div>
        </div>
      </div>
      <div style="margin-left:auto; display:flex; gap:16px;">
        <button class="action-btn ${post.isLiked ? 'active' : ''}" style="font-size:14px;" onclick="toggleLike(${post.id})">
          <span>${post.isLiked ? '❤️' : '🤍'}</span> <span>${post.likes}</span>
        </button>
        <button class="action-btn ${post.isCollected ? 'active' : ''}" style="font-size:14px;" onclick="toggleCollect(${post.id})">
          <span>${post.isCollected ? '⭐' : '☆'}</span> <span>${post.collects}</span>
        </button>
      </div>
    </div>
    <div class="article-body-text">
      ${post.fullContent}
    </div>
    ${post.images && post.images.length > 0 ? `
      <div class="article-gallery">
        ${post.images.map(img => `<img src="${img}" alt="大图展示">`).join('')}
      </div>
    ` : ''}
    
    <div class="comments-section">
      <div class="comments-title">全部评论 (${post.comments})</div>
      <div class="comment-input-box">
        <input type="text" id="newCommentInput" class="comment-input" placeholder="写下你的真实看法，与车友深度交流...">
        <button class="btn-comment-submit" onclick="submitComment(${post.id})">发表评论</button>
      </div>
      <div id="commentsListArea">
        ${post.commentsList ? post.commentsList.map(c => `
          <div style="padding:16px 0; border-bottom:1px solid #f0f1f5;">
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
              <span style="font-weight:600; font-size:14px; color:#1f2329;">${escapeHtml(c.user)}</span>
              <span style="font-size:12px; color:#86909c;">${escapeHtml(c.time)}</span>
            </div>
            <div style="font-size:14px; color:#4e5969;">${escapeHtml(c.text)}</div>
          </div>
        `).join('') : '<p style="color:#86909c; font-size:13px;">暂无评论，快来抢沙发~</p>'}
      </div>
    </div>
  `;
}

// Submit Comment
function submitComment(postId) {
  const input = document.getElementById('newCommentInput');
  if (!input || !input.value.trim()) return;
  
  const post = postsData.find(p => p.id === postId);
  if (post) {
    if (!post.commentsList) post.commentsList = [];
    post.commentsList.unshift({
      user: "懂车帝热心车友",
      time: "刚刚",
      text: input.value.trim()
    });
    post.comments += 1;
    input.value = '';
    renderModalDetails(post);
    renderFeed();
  }
}

// Follow Button Toggle
let isFollowing = true;
function toggleFollow() {
  const btn = document.getElementById('followBtn');
  isFollowing = !isFollowing;
  if (isFollowing) {
    btn.innerHTML = `<span>✓</span> 已关注`;
    btn.style.color = 'var(--dcd-green)';
    btn.style.backgroundColor = '#f4f5f7';
  } else {
    btn.innerHTML = `<span>+</span> 关注`;
    btn.style.color = '#ffffff';
    btn.style.backgroundColor = 'var(--dcd-orange)';
    btn.style.borderColor = 'var(--dcd-orange)';
  }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  renderFeed();
});
