import type { TranslationBook } from '@/types'

/** 官方示例句库：练习时不记录任何学习进度（见 isOfficialTranslationBook） */
export const DEFAULT_TRANSLATION_BOOKS: TranslationBook[] = [
  {
    id: 'radio_daily_morning_ep1',
    isOfficial: true,
    name: 'Five More Minutes! · 再睡五分钟',
    description: '日常生活 › 早晨起床 › 第1集：Alex 早上赖床不肯起，Emma 和小猫 Mochi 想尽办法把他叫醒。听完视频，来练练剧中的单词和句子吧。',
    category: 'daily',
    scenario: '官方示例',
    isCustom: false,
    totalSentences: 23,
    createdAt: 1794887876998,
    updatedAt: 1794887876998,
    sentences: [
      {
        id: 'radio_daily_morning_ep1_s01',
        sentenceEn: 'It is time to get up.',
        sentenceZh: '是时候起床了。',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'time', meaningZh: '时间；时候', pos: 'n.', kind: 'word' },
          { id: 'k2', word: 'get up', meaningZh: '起床', pos: 'phr.', kind: 'phrase' },
        ],
        grammar: {
          patternZh: '主语 + 系动词 + 表语 + 不定式定语',
          patternCode: 'S + Link + P + Attr(to do)',
          summary: 'It 是形式主语，is 是系动词，time 作表语；to get up 是不定式，修饰 time，表示“起床的时间”。句型 It is time to do sth. 意思是“该做某事了”。',
          tokens: [
            { text: 'It', cleanText: 'It', roleZh: '主语', roleCode: 'S', pos: 'pron.', explanation: '形式主语，本身没有实际意思，用来引出时间。' },
            { text: 'is', cleanText: 'is', roleZh: '系动词', roleCode: 'Link', pos: 'v.', explanation: 'be 动词，连接主语和表语。' },
            { text: 'time', cleanText: 'time', roleZh: '表语', roleCode: 'P', pos: 'n.', explanation: '说明主语的情况：是……的时候。' },
            { text: 'to', cleanText: 'to', roleZh: '定语（不定式）', roleCode: 'Attr', pos: 'part.', explanation: '不定式符号，与 get up 一起修饰 time。' },
            { text: 'get', cleanText: 'get', roleZh: '定语（不定式）', roleCode: 'Attr', pos: 'v.', explanation: '不定式中的动词，和 up 组成短语 get up。' },
            { text: 'up.', cleanText: 'up', roleZh: '定语（不定式）', roleCode: 'Attr', pos: 'adv.', explanation: '副词小品词，与 get 构成 get up“起床”。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s02',
        sentenceEn: 'I am so sleepy.',
        sentenceZh: '我好困啊。',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'sleepy', meaningZh: '困的；想睡觉的', pos: 'adj.', kind: 'word' },
        ],
        grammar: {
          patternZh: '主语 + 系动词 + 程度副词 + 表语',
          patternCode: 'S + Link + Adv + P',
          summary: '主系表结构：I 是主语，am 是系动词，sleepy 作表语说明状态；so 修饰 sleepy，表示“非常”。',
          tokens: [
            { text: 'I', cleanText: 'I', roleZh: '主语', roleCode: 'S', pos: 'pron.', explanation: '动作和状态的主体：我。' },
            { text: 'am', cleanText: 'am', roleZh: '系动词', roleCode: 'Link', pos: 'v.', explanation: 'be 动词与 I 搭配用 am，连接主语和表语。' },
            { text: 'so', cleanText: 'so', roleZh: '状语（程度）', roleCode: 'Adv', pos: 'adv.', explanation: '程度副词，修饰 sleepy，意为“这么、非常”。' },
            { text: 'sleepy.', cleanText: 'sleepy', roleZh: '表语', roleCode: 'P', pos: 'adj.', explanation: '形容词作表语，说明主语“困”的状态。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s03',
        sentenceEn: 'Look at the clock.',
        sentenceZh: '看看钟。',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'clock', meaningZh: '钟；时钟', pos: 'n.', kind: 'word' },
          { id: 'k2', word: 'look at', meaningZh: '看……', pos: 'phr.', kind: 'phrase' },
        ],
        grammar: {
          patternZh: '祈使句：谓语 + 介词 + 宾语',
          patternCode: 'V + Prep + O',
          summary: '祈使句省略主语 you，直接用动词原形 look 开头；look at 是固定搭配“看……”，the clock 是介词 at 的宾语。',
          tokens: [
            { text: 'Look', cleanText: 'Look', roleZh: '谓语', roleCode: 'V', pos: 'v.', explanation: '祈使句用动词原形开头，表示命令或提醒。' },
            { text: 'at', cleanText: 'at', roleZh: '介词', roleCode: 'Prep', pos: 'prep.', explanation: '与 look 搭配成 look at，引出看的对象。' },
            { text: 'the', cleanText: 'the', roleZh: '定语', roleCode: 'Attr', pos: 'art.', explanation: '定冠词，特指房间里那个钟。' },
            { text: 'clock.', cleanText: 'clock', roleZh: '宾语（介词宾语）', roleCode: 'O', pos: 'n.', explanation: '介词 at 的宾语，看的对象。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s04',
        sentenceEn: 'I need to wash my face.',
        sentenceZh: '我得洗把脸。',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'need', meaningZh: '需要', pos: 'v.', kind: 'word' },
          { id: 'k2', word: 'wash', meaningZh: '洗', pos: 'v.', kind: 'word' },
          { id: 'k3', word: 'face', meaningZh: '脸', pos: 'n.', kind: 'word' },
        ],
        grammar: {
          patternZh: '主语 + 谓语 + 不定式宾语',
          patternCode: 'S + V + O(to do)',
          summary: 'need to do sth. 表示“需要做某事”；to wash my face 整体作 need 的宾语，其中 my face 又是 wash 的宾语。',
          tokens: [
            { text: 'I', cleanText: 'I', roleZh: '主语', roleCode: 'S', pos: 'pron.', explanation: '动作的发出者：我。' },
            { text: 'need', cleanText: 'need', roleZh: '谓语', roleCode: 'V', pos: 'v.', explanation: '实义动词，表示“需要”。' },
            { text: 'to', cleanText: 'to', roleZh: '宾语（不定式）', roleCode: 'O', pos: 'part.', explanation: '不定式符号，to wash my face 整体作 need 的宾语。' },
            { text: 'wash', cleanText: 'wash', roleZh: '宾语（不定式）', roleCode: 'O', pos: 'v.', explanation: '不定式中的动词“洗”。' },
            { text: 'my', cleanText: 'my', roleZh: '定语', roleCode: 'Attr', pos: 'pron.', explanation: '形容词性物主代词，修饰 face：我的。' },
            { text: 'face.', cleanText: 'face', roleZh: '宾语（不定式内）', roleCode: 'O', pos: 'n.', explanation: 'wash 的宾语：脸。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s05',
        sentenceEn: 'The water is so cold!',
        sentenceZh: '水好凉啊！',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'water', meaningZh: '水', pos: 'n.', kind: 'word' },
          { id: 'k2', word: 'cold', meaningZh: '冷的；凉的', pos: 'adj.', kind: 'word' },
        ],
        grammar: {
          patternZh: '主语 + 系动词 + 程度副词 + 表语',
          patternCode: 'S + Link + Adv + P',
          summary: '主系表结构：the water 是主语，is 是系动词，cold 作表语；so 加强语气，表示“这么凉”。',
          tokens: [
            { text: 'The', cleanText: 'The', roleZh: '定语', roleCode: 'Attr', pos: 'art.', explanation: '定冠词，特指正在用的水。' },
            { text: 'water', cleanText: 'water', roleZh: '主语', roleCode: 'S', pos: 'n.', explanation: '句子描述的对象：水。' },
            { text: 'is', cleanText: 'is', roleZh: '系动词', roleCode: 'Link', pos: 'v.', explanation: 'be 动词，连接主语和表语。' },
            { text: 'so', cleanText: 'so', roleZh: '状语（程度）', roleCode: 'Adv', pos: 'adv.', explanation: '程度副词，修饰 cold。' },
            { text: 'cold!', cleanText: 'cold', roleZh: '表语', roleCode: 'P', pos: 'adj.', explanation: '形容词作表语，说明水的状态。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s06',
        sentenceEn: 'Where is my toothbrush?',
        sentenceZh: '我的牙刷在哪儿？',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'toothbrush', meaningZh: '牙刷', pos: 'n.', kind: 'word' },
        ],
        grammar: {
          patternZh: '特殊疑问句：疑问副词 + 系动词 + 主语',
          patternCode: 'Adv + Link + S',
          summary: 'Where 引导特殊疑问句询问地点，放在句首；is 提到主语 my toothbrush 前面。口语常缩写为 Where\'s。',
          tokens: [
            { text: 'Where', cleanText: 'Where', roleZh: '状语（地点）', roleCode: 'Adv', pos: 'adv.', explanation: '疑问副词，询问“在哪里”。' },
            { text: 'is', cleanText: 'is', roleZh: '系动词', roleCode: 'Link', pos: 'v.', explanation: 'be 动词，表示“在”，疑问句中放在主语前。' },
            { text: 'my', cleanText: 'my', roleZh: '定语', roleCode: 'Attr', pos: 'pron.', explanation: '物主代词，修饰 toothbrush：我的。' },
            { text: 'toothbrush?', cleanText: 'toothbrush', roleZh: '主语', roleCode: 'S', pos: 'n.', explanation: '被询问位置的东西：牙刷。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s07',
        sentenceEn: 'It is in the blue cup.',
        sentenceZh: '在蓝色杯子里。',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'blue', meaningZh: '蓝色的', pos: 'adj.', kind: 'word' },
          { id: 'k2', word: 'cup', meaningZh: '杯子', pos: 'n.', kind: 'word' },
        ],
        grammar: {
          patternZh: '主语 + 系动词 + 介词短语作表语',
          patternCode: 'S + Link + Prep + O',
          summary: 'It 指代牙刷；is 是系动词；in the blue cup 是介词短语，说明它所在的位置。',
          tokens: [
            { text: 'It', cleanText: 'It', roleZh: '主语', roleCode: 'S', pos: 'pron.', explanation: '代词，指前面说的牙刷。' },
            { text: 'is', cleanText: 'is', roleZh: '系动词', roleCode: 'Link', pos: 'v.', explanation: 'be 动词，表示“在”。' },
            { text: 'in', cleanText: 'in', roleZh: '介词', roleCode: 'Prep', pos: 'prep.', explanation: '表示“在……里面”。' },
            { text: 'the', cleanText: 'the', roleZh: '定语', roleCode: 'Attr', pos: 'art.', explanation: '定冠词，特指那个杯子。' },
            { text: 'blue', cleanText: 'blue', roleZh: '定语', roleCode: 'Attr', pos: 'adj.', explanation: '形容词修饰 cup：蓝色的。' },
            { text: 'cup.', cleanText: 'cup', roleZh: '宾语（介词宾语）', roleCode: 'O', pos: 'n.', explanation: '介词 in 的宾语：杯子。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s08',
        sentenceEn: 'Hurry up! I need the bathroom too.',
        sentenceZh: '快点！我也要用洗手间。',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'need', meaningZh: '需要', pos: 'v.', kind: 'word' },
          { id: 'k2', word: 'bathroom', meaningZh: '洗手间；浴室', pos: 'n.', kind: 'word' },
          { id: 'k3', word: 'too', meaningZh: '也', pos: 'adv.', kind: 'word' },
          { id: 'k4', word: 'hurry up', meaningZh: '快点；赶快', pos: 'phr.', kind: 'phrase' },
        ],
        grammar: {
          patternZh: '祈使句 + 主语 + 谓语 + 宾语 + 状语',
          patternCode: 'V + Adv! S + V + O + Adv',
          summary: '前半句是祈使句 Hurry up!，催促对方快点；后半句是主谓宾结构，too 放句末表示“也”。',
          tokens: [
            { text: 'Hurry', cleanText: 'Hurry', roleZh: '谓语', roleCode: 'V', pos: 'v.', explanation: '祈使句动词原形，与 up 构成 hurry up。' },
            { text: 'up!', cleanText: 'up', roleZh: '状语（小品词）', roleCode: 'Adv', pos: 'adv.', explanation: '副词小品词，与 hurry 组成短语“赶快”。' },
            { text: 'I', cleanText: 'I', roleZh: '主语', roleCode: 'S', pos: 'pron.', explanation: '第二句的主语：我。' },
            { text: 'need', cleanText: 'need', roleZh: '谓语', roleCode: 'V', pos: 'v.', explanation: '实义动词，表示“需要（用）”。' },
            { text: 'the', cleanText: 'the', roleZh: '定语', roleCode: 'Attr', pos: 'art.', explanation: '定冠词，特指家里的洗手间。' },
            { text: 'bathroom', cleanText: 'bathroom', roleZh: '宾语', roleCode: 'O', pos: 'n.', explanation: 'need 的宾语：洗手间。' },
            { text: 'too.', cleanText: 'too', roleZh: '状语', roleCode: 'Adv', pos: 'adv.', explanation: '副词放句末，表示“也”。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s09',
        sentenceEn: 'I am brushing my teeth.',
        sentenceZh: '我在刷牙。',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'brush', meaningZh: '刷', pos: 'v.', kind: 'word' },
          { id: 'k2', word: 'teeth', meaningZh: '牙齿（tooth 的复数）', pos: 'n.', kind: 'word' },
        ],
        grammar: {
          patternZh: '现在进行时：主语 + be + 动词-ing + 宾语',
          patternCode: 'S + V(be + V-ing) + O',
          summary: 'am brushing 是现在进行时，表示此刻正在做的动作；my teeth 是 brushing 的宾语。',
          tokens: [
            { text: 'I', cleanText: 'I', roleZh: '主语', roleCode: 'S', pos: 'pron.', explanation: '动作的发出者：我。' },
            { text: 'am', cleanText: 'am', roleZh: '谓语（助动词）', roleCode: 'V', pos: 'v.', explanation: '助动词 be，与 brushing 构成现在进行时。' },
            { text: 'brushing', cleanText: 'brushing', roleZh: '谓语', roleCode: 'V', pos: 'v.', explanation: '动词 -ing 形式，表示正在刷。' },
            { text: 'my', cleanText: 'my', roleZh: '定语', roleCode: 'Attr', pos: 'pron.', explanation: '物主代词，修饰 teeth。' },
            { text: 'teeth.', cleanText: 'teeth', roleZh: '宾语', roleCode: 'O', pos: 'n.', explanation: 'brushing 的宾语：牙齿。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s10',
        sentenceEn: 'What should I wear today?',
        sentenceZh: '我今天穿什么呢？',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'wear', meaningZh: '穿；戴', pos: 'v.', kind: 'word' },
          { id: 'k2', word: 'today', meaningZh: '今天', pos: 'adv.', kind: 'word' },
        ],
        grammar: {
          patternZh: '特殊疑问句：疑问词 + 情态动词 + 主语 + 谓语 + 状语',
          patternCode: 'O + V + S + V + Adv',
          summary: 'What 是 wear 的宾语，提到句首提问；should 是情态动词，提到主语 I 前面构成疑问；today 作时间状语。',
          tokens: [
            { text: 'What', cleanText: 'What', roleZh: '宾语（疑问词）', roleCode: 'O', pos: 'pron.', explanation: '疑问代词，作 wear 的宾语，问“什么”。' },
            { text: 'should', cleanText: 'should', roleZh: '谓语（情态动词）', roleCode: 'V', pos: 'v.', explanation: '情态动词，表示“应该”，疑问句中放在主语前。' },
            { text: 'I', cleanText: 'I', roleZh: '主语', roleCode: 'S', pos: 'pron.', explanation: '动作的发出者：我。' },
            { text: 'wear', cleanText: 'wear', roleZh: '谓语', roleCode: 'V', pos: 'v.', explanation: '实义动词原形，表示“穿”。' },
            { text: 'today?', cleanText: 'today', roleZh: '状语（时间）', roleCode: 'Adv', pos: 'adv.', explanation: '时间副词：今天。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s11',
        sentenceEn: 'The blue shirt looks nice.',
        sentenceZh: '蓝衬衫很好看。',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'shirt', meaningZh: '衬衫', pos: 'n.', kind: 'word' },
          { id: 'k2', word: 'nice', meaningZh: '好看的；好的', pos: 'adj.', kind: 'word' },
        ],
        grammar: {
          patternZh: '主语 + 感官系动词 + 表语',
          patternCode: 'S + Link + P',
          summary: 'look 在这里是系动词，意思是“看起来”，后面接形容词 nice 作表语；主语是第三人称单数，所以用 looks。',
          tokens: [
            { text: 'The', cleanText: 'The', roleZh: '定语', roleCode: 'Attr', pos: 'art.', explanation: '定冠词，特指那件衬衫。' },
            { text: 'blue', cleanText: 'blue', roleZh: '定语', roleCode: 'Attr', pos: 'adj.', explanation: '形容词修饰 shirt：蓝色的。' },
            { text: 'shirt', cleanText: 'shirt', roleZh: '主语', roleCode: 'S', pos: 'n.', explanation: '句子描述的对象：衬衫。' },
            { text: 'looks', cleanText: 'looks', roleZh: '系动词', roleCode: 'Link', pos: 'v.', explanation: '感官系动词“看起来”，三单形式加 -s。' },
            { text: 'nice.', cleanText: 'nice', roleZh: '表语', roleCode: 'P', pos: 'adj.', explanation: '形容词作表语：好看的。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s12',
        sentenceEn: 'Where is my other sock?',
        sentenceZh: '我的另一只袜子在哪儿？',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'other', meaningZh: '另一个的', pos: 'adj.', kind: 'word' },
          { id: 'k2', word: 'sock', meaningZh: '袜子', pos: 'n.', kind: 'word' },
        ],
        grammar: {
          patternZh: '特殊疑问句：疑问副词 + 系动词 + 主语',
          patternCode: 'Adv + Link + S',
          summary: 'Where 询问地点放在句首，is 放在主语前；my other sock 是主语，other 表示“（两只中的）另一只”。',
          tokens: [
            { text: 'Where', cleanText: 'Where', roleZh: '状语（地点）', roleCode: 'Adv', pos: 'adv.', explanation: '疑问副词，询问“在哪里”。' },
            { text: 'is', cleanText: 'is', roleZh: '系动词', roleCode: 'Link', pos: 'v.', explanation: 'be 动词，表示“在”。' },
            { text: 'my', cleanText: 'my', roleZh: '定语', roleCode: 'Attr', pos: 'pron.', explanation: '物主代词：我的。' },
            { text: 'other', cleanText: 'other', roleZh: '定语', roleCode: 'Attr', pos: 'adj.', explanation: '形容词修饰 sock：另一只。' },
            { text: 'sock?', cleanText: 'sock', roleZh: '主语', roleCode: 'S', pos: 'n.', explanation: '被询问位置的东西：袜子。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s13',
        sentenceEn: 'Is it under the bed?',
        sentenceZh: '在床底下吗？',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'under', meaningZh: '在……下面', pos: 'prep.', kind: 'word' },
          { id: 'k2', word: 'bed', meaningZh: '床', pos: 'n.', kind: 'word' },
        ],
        grammar: {
          patternZh: '一般疑问句：系动词 + 主语 + 介词短语',
          patternCode: 'Link + S + Prep + O',
          summary: '把 is 提到主语 it 前面构成一般疑问句；under the bed 是介词短语，说明位置。',
          tokens: [
            { text: 'Is', cleanText: 'Is', roleZh: '系动词', roleCode: 'Link', pos: 'v.', explanation: 'be 动词提到句首，构成一般疑问句。' },
            { text: 'it', cleanText: 'it', roleZh: '主语', roleCode: 'S', pos: 'pron.', explanation: '指那只袜子。' },
            { text: 'under', cleanText: 'under', roleZh: '介词', roleCode: 'Prep', pos: 'prep.', explanation: '表示“在……下面”。' },
            { text: 'the', cleanText: 'the', roleZh: '定语', roleCode: 'Attr', pos: 'art.', explanation: '定冠词，特指这张床。' },
            { text: 'bed?', cleanText: 'bed', roleZh: '宾语（介词宾语）', roleCode: 'O', pos: 'n.', explanation: '介词 under 的宾语：床。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s14',
        sentenceEn: 'Give it back, please!',
        sentenceZh: '请还给我！',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'give', meaningZh: '给', pos: 'v.', kind: 'word' },
          { id: 'k2', word: 'please', meaningZh: '请', pos: 'adv.', kind: 'word' },
          { id: 'k3', word: 'give back', meaningZh: '归还；还回来', pos: 'phr.', kind: 'phrase' },
        ],
        grammar: {
          patternZh: '祈使句：谓语 + 宾语 + 小品词 + 礼貌用语',
          patternCode: 'V + O + Adv + Adv',
          summary: '祈使句用动词原形 give 开头；代词 it 要放在 give 和 back 中间（give it back）；please 放句末让语气更礼貌。',
          tokens: [
            { text: 'Give', cleanText: 'Give', roleZh: '谓语', roleCode: 'V', pos: 'v.', explanation: '祈使句动词原形，与 back 构成 give back。' },
            { text: 'it', cleanText: 'it', roleZh: '宾语', roleCode: 'O', pos: 'pron.', explanation: '代词作宾语，指那只袜子，放在 give 和 back 中间。' },
            { text: 'back,', cleanText: 'back', roleZh: '状语（小品词）', roleCode: 'Adv', pos: 'adv.', explanation: '副词小品词，表示“归还、回来”。' },
            { text: 'please!', cleanText: 'please', roleZh: '状语', roleCode: 'Adv', pos: 'adv.', explanation: '礼貌用语，表示“请”。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s15',
        sentenceEn: 'Breakfast is ready!',
        sentenceZh: '早餐做好啦！',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'breakfast', meaningZh: '早餐', pos: 'n.', kind: 'word' },
          { id: 'k2', word: 'ready', meaningZh: '准备好的', pos: 'adj.', kind: 'word' },
        ],
        grammar: {
          patternZh: '主语 + 系动词 + 表语',
          patternCode: 'S + Link + P',
          summary: '主系表结构：breakfast 是主语，is 是系动词，ready 作表语，表示“准备好了”。三餐名称前一般不加冠词。',
          tokens: [
            { text: 'Breakfast', cleanText: 'Breakfast', roleZh: '主语', roleCode: 'S', pos: 'n.', explanation: '句子描述的对象：早餐，前面不加冠词。' },
            { text: 'is', cleanText: 'is', roleZh: '系动词', roleCode: 'Link', pos: 'v.', explanation: 'be 动词，连接主语和表语。' },
            { text: 'ready!', cleanText: 'ready', roleZh: '表语', roleCode: 'P', pos: 'adj.', explanation: '形容词作表语：准备好的。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s16',
        sentenceEn: 'Do you want some milk?',
        sentenceZh: '你要喝点牛奶吗？',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'want', meaningZh: '想要', pos: 'v.', kind: 'word' },
          { id: 'k2', word: 'some', meaningZh: '一些', pos: 'pron.', kind: 'word' },
          { id: 'k3', word: 'milk', meaningZh: '牛奶', pos: 'n.', kind: 'word' },
        ],
        grammar: {
          patternZh: '一般疑问句：助动词 + 主语 + 谓语 + 宾语',
          patternCode: 'V(Do) + S + V + O',
          summary: '实义动词 want 的一般疑问句要借助助动词 do；表示请求或提供东西时，疑问句里也常用 some。',
          tokens: [
            { text: 'Do', cleanText: 'Do', roleZh: '谓语（助动词）', roleCode: 'V', pos: 'v.', explanation: '助动词，帮助构成一般疑问句，本身无实义。' },
            { text: 'you', cleanText: 'you', roleZh: '主语', roleCode: 'S', pos: 'pron.', explanation: '动作的发出者：你。' },
            { text: 'want', cleanText: 'want', roleZh: '谓语', roleCode: 'V', pos: 'v.', explanation: '实义动词原形：想要。' },
            { text: 'some', cleanText: 'some', roleZh: '定语', roleCode: 'Attr', pos: 'det.', explanation: '限定词修饰 milk：一些。' },
            { text: 'milk?', cleanText: 'milk', roleZh: '宾语', roleCode: 'O', pos: 'n.', explanation: 'want 的宾语：牛奶，不可数名词。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s17',
        sentenceEn: 'Here is your breakfast.',
        sentenceZh: '这是你的早餐。',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'here', meaningZh: '这里', pos: 'adv.', kind: 'word' },
          { id: 'k2', word: 'breakfast', meaningZh: '早餐', pos: 'n.', kind: 'word' },
        ],
        grammar: {
          patternZh: '倒装句：地点副词 + 系动词 + 主语',
          patternCode: 'Adv + Link + S',
          summary: 'Here is + 名词 是递东西时的常用说法，Here 放句首，句子倒装，真正的主语是 your breakfast。',
          tokens: [
            { text: 'Here', cleanText: 'Here', roleZh: '状语（地点）', roleCode: 'Adv', pos: 'adv.', explanation: '地点副词放句首，引起倒装：这里。' },
            { text: 'is', cleanText: 'is', roleZh: '系动词', roleCode: 'Link', pos: 'v.', explanation: 'be 动词，放在主语前面。' },
            { text: 'your', cleanText: 'your', roleZh: '定语', roleCode: 'Attr', pos: 'pron.', explanation: '物主代词：你的。' },
            { text: 'breakfast.', cleanText: 'breakfast', roleZh: '主语', roleCode: 'S', pos: 'n.', explanation: '真正的主语：早餐。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s18',
        sentenceEn: 'Where are my keys?',
        sentenceZh: '我的钥匙在哪儿？',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'key', meaningZh: '钥匙（复数 keys）', pos: 'n.', kind: 'word' },
        ],
        grammar: {
          patternZh: '特殊疑问句：疑问副词 + 系动词 + 主语',
          patternCode: 'Adv + Link + S',
          summary: 'Where 询问地点；主语 my keys 是复数，所以系动词用 are 而不是 is。',
          tokens: [
            { text: 'Where', cleanText: 'Where', roleZh: '状语（地点）', roleCode: 'Adv', pos: 'adv.', explanation: '疑问副词，询问“在哪里”。' },
            { text: 'are', cleanText: 'are', roleZh: '系动词', roleCode: 'Link', pos: 'v.', explanation: 'be 动词复数形式，与 keys 一致。' },
            { text: 'my', cleanText: 'my', roleZh: '定语', roleCode: 'Attr', pos: 'pron.', explanation: '物主代词：我的。' },
            { text: 'keys?', cleanText: 'keys', roleZh: '主语', roleCode: 'S', pos: 'n.', explanation: '复数名词：钥匙。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s19',
        sentenceEn: 'Are they in your bag?',
        sentenceZh: '在你包里吗？',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'bag', meaningZh: '包', pos: 'n.', kind: 'word' },
        ],
        grammar: {
          patternZh: '一般疑问句：系动词 + 主语 + 介词短语',
          patternCode: 'Link + S + Prep + O',
          summary: '把 are 提到主语 they 前面构成一般疑问句；in your bag 是介词短语，说明位置。',
          tokens: [
            { text: 'Are', cleanText: 'Are', roleZh: '系动词', roleCode: 'Link', pos: 'v.', explanation: 'be 动词提到句首，构成一般疑问句。' },
            { text: 'they', cleanText: 'they', roleZh: '主语', roleCode: 'S', pos: 'pron.', explanation: '指那些钥匙，复数。' },
            { text: 'in', cleanText: 'in', roleZh: '介词', roleCode: 'Prep', pos: 'prep.', explanation: '表示“在……里面”。' },
            { text: 'your', cleanText: 'your', roleZh: '定语', roleCode: 'Attr', pos: 'pron.', explanation: '物主代词：你的。' },
            { text: 'bag?', cleanText: 'bag', roleZh: '宾语（介词宾语）', roleCode: 'O', pos: 'n.', explanation: '介词 in 的宾语：包。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s20',
        sentenceEn: 'My keys are under Mochi!',
        sentenceZh: '我的钥匙在麻糬身子底下！',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'key', meaningZh: '钥匙（复数 keys）', pos: 'n.', kind: 'word' },
          { id: 'k2', word: 'under', meaningZh: '在……下面', pos: 'prep.', kind: 'word' },
        ],
        grammar: {
          patternZh: '主语 + 系动词 + 介词短语作表语',
          patternCode: 'S + Link + Prep + O',
          summary: 'my keys 是复数主语，系动词用 are；under Mochi 是介词短语，说明钥匙的位置。',
          tokens: [
            { text: 'My', cleanText: 'My', roleZh: '定语', roleCode: 'Attr', pos: 'pron.', explanation: '物主代词：我的。' },
            { text: 'keys', cleanText: 'keys', roleZh: '主语', roleCode: 'S', pos: 'n.', explanation: '复数名词：钥匙。' },
            { text: 'are', cleanText: 'are', roleZh: '系动词', roleCode: 'Link', pos: 'v.', explanation: 'be 动词复数形式，表示“在”。' },
            { text: 'under', cleanText: 'under', roleZh: '介词', roleCode: 'Prep', pos: 'prep.', explanation: '表示“在……下面”。' },
            { text: 'Mochi!', cleanText: 'Mochi', roleZh: '宾语（介词宾语）', roleCode: 'O', pos: 'n.', explanation: '介词 under 的宾语：小猫麻糬。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s21',
        sentenceEn: 'I am ready!',
        sentenceZh: '我准备好了！',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'ready', meaningZh: '准备好的', pos: 'adj.', kind: 'word' },
        ],
        grammar: {
          patternZh: '主语 + 系动词 + 表语',
          patternCode: 'S + Link + P',
          summary: '主系表结构，ready 作表语表示“准备好了”。口语常缩写为 I\'m ready!',
          tokens: [
            { text: 'I', cleanText: 'I', roleZh: '主语', roleCode: 'S', pos: 'pron.', explanation: '句子的主体：我。' },
            { text: 'am', cleanText: 'am', roleZh: '系动词', roleCode: 'Link', pos: 'v.', explanation: 'be 动词与 I 搭配用 am。' },
            { text: 'ready!', cleanText: 'ready', roleZh: '表语', roleCode: 'P', pos: 'adj.', explanation: '形容词作表语：准备好的。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s22',
        sentenceEn: 'See you tonight!',
        sentenceZh: '晚上见！',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'tonight', meaningZh: '今晚', pos: 'adv.', kind: 'word' },
          { id: 'k2', word: 'see you', meaningZh: '再见；回头见', pos: 'phr.', kind: 'phrase' },
        ],
        grammar: {
          patternZh: '省略主语：谓语 + 宾语 + 时间状语',
          patternCode: 'V + O + Adv',
          summary: '完整说法是 I\'ll see you tonight.，口语中省略主语和助动词；tonight 作时间状语。',
          tokens: [
            { text: 'See', cleanText: 'See', roleZh: '谓语', roleCode: 'V', pos: 'v.', explanation: '动词“见”，前面省略了 I\'ll。' },
            { text: 'you', cleanText: 'you', roleZh: '宾语', roleCode: 'O', pos: 'pron.', explanation: 'see 的宾语：你。' },
            { text: 'tonight!', cleanText: 'tonight', roleZh: '状语（时间）', roleCode: 'Adv', pos: 'adv.', explanation: '时间副词：今晚。' },
          ],
        },
        pronunciation: null,
      },
      {
        id: 'radio_daily_morning_ep1_s23',
        sentenceEn: 'Look at your feet!',
        sentenceZh: '看看你的脚！',
        category: '早晨起床',
        difficulty: 'easy',
        keywords: [
          { id: 'k1', word: 'foot', meaningZh: '脚（复数 feet）', pos: 'n.', kind: 'word' },
          { id: 'k2', word: 'look at', meaningZh: '看……', pos: 'phr.', kind: 'phrase' },
        ],
        grammar: {
          patternZh: '祈使句：谓语 + 介词 + 宾语',
          patternCode: 'V + Prep + O',
          summary: '祈使句用动词原形 look 开头，look at 表示“看……”；feet 是 foot 的不规则复数。',
          tokens: [
            { text: 'Look', cleanText: 'Look', roleZh: '谓语', roleCode: 'V', pos: 'v.', explanation: '祈使句动词原形，提醒对方去看。' },
            { text: 'at', cleanText: 'at', roleZh: '介词', roleCode: 'Prep', pos: 'prep.', explanation: '与 look 搭配，引出看的对象。' },
            { text: 'your', cleanText: 'your', roleZh: '定语', roleCode: 'Attr', pos: 'pron.', explanation: '物主代词：你的。' },
            { text: 'feet!', cleanText: 'feet', roleZh: '宾语（介词宾语）', roleCode: 'O', pos: 'n.', explanation: '介词 at 的宾语，foot 的复数：脚。' },
          ],
        },
        pronunciation: null,
      },
    ],
  },
]

const OFFICIAL_TRANSLATION_BOOK_IDS = new Set(
  DEFAULT_TRANSLATION_BOOKS.filter((book) => book.isOfficial).map((book) => book.id)
)

const OFFICIAL_SENTENCE_IDS = new Set(
  DEFAULT_TRANSLATION_BOOKS.filter((book) => book.isOfficial).flatMap((book) => book.sentences.map((s) => s.id))
)

export function isOfficialTranslationBook(bookId: string | undefined | null): boolean {
  return Boolean(bookId) && OFFICIAL_TRANSLATION_BOOK_IDS.has(bookId as string)
}

export function isOfficialSentence(sentenceId: string): boolean {
  return OFFICIAL_SENTENCE_IDS.has(sentenceId)
}
