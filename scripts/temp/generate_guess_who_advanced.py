"""
生成"猜猜我是谁"高级模式人物卡数据
3 套场景：学校、家庭、公园
每套 24 张人物卡，含 SVG 描述（供前端生成 SVG）、中文描述（HSK 1-3）、拼音标注、属性字典
"""
import json

# ============================================================
# SVG 头像组件 helper（前端用内联 SVG 渲染，这里只生成参数）
# 每张卡存 "avatarParams"，前端根据参数生成 SVG 头像
# ============================================================

# 属性参数池
SKIN_COLORS = ['#FFDAB9', '#D2A679', '#C68642', '#8D5524']
HAIR_COLORS = ['#1a1a1a', '#3b1f0d', '#c5821a', '#d4c27a', '#a0522d', '#f0e0b0']
HAIR_STYLES = ['short', 'long', 'bald', 'bun', 'curly']  # 短/长/秃/发髻/卷
EYE_STYLES = ['normal', 'glasses', 'sunglasses']
CLOTHES_COLORS = ['red', 'blue', 'green', 'yellow', 'white', 'black', 'purple', 'orange']
CLOTHES_COLORS_ZH = {'red':'红色','blue':'蓝色','green':'绿色','yellow':'黄色','white':'白色','black':'黑色','purple':'紫色','orange':'橙色'}
ACCESSORIES = ['none', 'hat', 'scarf', 'earrings', 'none']
EXPRESSIONS = ['happy', 'sad', 'angry', 'surprised', 'neutral']
EXPRESSIONS_ZH = {'happy':'开心','sad':'难过','angry':'生气','surprised':'惊讶','neutral':'平静'}

GENDERS = ['男', '女']
AGE_GROUPS = ['年轻', '中年', '老年']
AGE_GROUPS_EN = {'年轻':'young','中年':'middle','老年':'old'}

# ============================================================
# 场景定义
# ============================================================
SCENES = {
    'school': {
        'name': '学校',
        'name_id': 'Sekolah',
        'bg_color': '#EFF6FF',
        'context_zh': '学校',
        'roles_neutral': ['学生','老师','校长','图书管理员','清洁工','保安'],  # 中性职业
        'roles_male': [],
        'roles_female': [],
        'actions': ['在学习','在看书','在写字','在跑步','在唱歌','在画画','在睡觉','在吃饭'],
        'locations': ['教室','图书馆','操场','食堂'],
    },
    'family': {
        'name': '家庭',
        'name_id': 'Keluarga',
        'bg_color': '#FFF7ED',
        'context_zh': '家',
        'roles_neutral': [],
        'roles_male': ['爸爸','哥哥','弟弟','爷爷'],   # 男性专属
        'roles_female': ['妈妈','姐姐','妹妹','奶奶'],  # 女性专属
        'actions': ['在做饭','在看电视','在睡觉','在打电话','在打扫','在喝茶','在买东西','在唱歌'],
        'locations': ['客厅','厨房','卧室','花园'],
    },
    'park': {
        'name': '公园',
        'name_id': 'Taman',
        'bg_color': '#F0FDF4',
        'context_zh': '公园',
        'roles_neutral': ['游客','摄影师','运动员','卖东西的人','小朋友','老人'],
        'roles_male': [],
        'roles_female': [],
        'actions': ['在跑步','在拍照','在喝水','在休息','在打电话','在看书','在唱歌','在打太极'],
        'locations': ['草地','喷泉旁','长椅上','树下'],
    },
}

# ============================================================
# 24 张人物数据（属性组合确保每张都不同）
# ============================================================
import random
random.seed(42)

def make_description_and_pinyin(attrs: dict, scene_key: str) -> tuple[str, str]:
    """生成中文描述句子（HSK 1-2 为主）+ 对应拼音"""
    gender = attrs['gender']
    pronoun = '他' if gender == '男' else '她'
    pronoun_py = 'tā'
    
    parts = []
    parts_py = []
    
    # 句1：性别+年龄+职业
    age = attrs['age']
    role = attrs['role']
    if age == '老年':
        parts.append(f'{pronoun}是{age}人，是{role}。')
        parts_py.append(f'{pronoun_py} shì {age}rén, shì {role}.')
    else:
        parts.append(f'{pronoun}是{role}。')
        parts_py.append(f'{pronoun_py} shì {role}.')
    
    # 句2：外貌特征
    glasses = attrs.get('glasses', False)
    hat = attrs.get('hat', False)
    if glasses and hat:
        parts.append(f'{pronoun}戴眼镜，也戴帽子。')
        parts_py.append(f'{pronoun_py} dài yǎnjìng, yě dài màozi.')
    elif glasses:
        parts.append(f'{pronoun}戴眼镜。')
        parts_py.append(f'{pronoun_py} dài yǎnjìng.')
    elif hat:
        parts.append(f'{pronoun}戴帽子。')
        parts_py.append(f'{pronoun_py} dài màozi.')
    else:
        parts.append(f'{pronoun}不戴眼镜，不戴帽子。')
        parts_py.append(f'{pronoun_py} bù dài yǎnjìng, bù dài màozi.')
    
    # 句3：衣服颜色
    color_zh = CLOTHES_COLORS_ZH[attrs['clothesColor']]
    parts.append(f'{pronoun}穿{color_zh}的衣服。')
    parts_py.append(f'{pronoun_py} chuān {color_zh} de yīfu.')
    
    # 句4：正在做什么
    action = attrs['action']
    parts.append(f'{pronoun}{action}。')
    parts_py.append(f'{pronoun_py} {action}.')
    
    # 句5：表情（可选）
    expr = attrs['expression']
    if expr != 'neutral':
        expr_zh = EXPRESSIONS_ZH[expr]
        parts.append(f'{pronoun}很{expr_zh}。')
        parts_py.append(f'{pronoun_py} hěn {expr_zh}.')
    
    return ' '.join(parts), ' '.join(parts_py)


def generate_24_characters(scene_key: str) -> list[dict]:
    scene = SCENES[scene_key]
    characters = []
    
    # 确保属性分布多样：各2种性别、3种年龄、各种头发/眼镜/帽子组合
    combos = []
    for gender in ['男', '女']:
        for age in AGE_GROUPS:
            for glasses in [True, False]:
                for hat in [True, False]:
                    combos.append({'gender': gender, 'age': age, 'glasses': glasses, 'hat': hat})
    
    random.shuffle(combos)
    combos = combos[:24]
    
    role_list_neutral = scene.get('roles_neutral', []) * 10
    role_list_male = scene.get('roles_male', []) * 10
    role_list_female = scene.get('roles_female', []) * 10
    action_list = scene['actions'] * 10
    
    for i, combo in enumerate(combos):
        skin = random.choice(SKIN_COLORS)
        hair_color = random.choice(HAIR_COLORS)
        hair_style = random.choice(HAIR_STYLES)
        if combo['age'] == '老年':
            hair_color = '#d0d0d0'  # 灰发
        if combo['gender'] == '女' and hair_style == 'bald':
            hair_style = 'long'
        
        clothes_color = random.choice(CLOTHES_COLORS)
        expression = random.choice(EXPRESSIONS)
        role = None
        if combo['gender'] == '男' and role_list_male:
            role = role_list_male[i % len(role_list_male)]
        elif combo['gender'] == '女' and role_list_female:
            role = role_list_female[i % len(role_list_female)]
        if role is None:
            role = role_list_neutral[i % max(len(role_list_neutral), 1)]
        action = action_list[i % len(scene['actions'])]
        location = random.choice(scene['locations'])
        
        attrs = {
            'gender': combo['gender'],
            'age': combo['age'],
            'role': role,
            'action': action,
            'location': location,
            'glasses': combo['glasses'],
            'hat': combo['hat'],
            'clothesColor': clothes_color,
            'expression': expression,
            'skinColor': skin,
            'hairColor': hair_color,
            'hairStyle': hair_style,
        }
        
        desc_zh, desc_py = make_description_and_pinyin(attrs, scene_key)
        
        # 生成名字
        male_names = ['小明','大强','建国','志远','俊杰','天宇','浩然','文博','宇航','明轩']
        female_names = ['小红','美丽','雪梅','芳华','玉珍','晓燕','婷婷','佳慧','诗涵','紫萱']
        if combo['gender'] == '男':
            name = male_names[i % len(male_names)]
        else:
            name = female_names[i % len(female_names)]
        
        # 避免重复名字
        existing_names = [c['name'] for c in characters]
        counter = 1
        orig_name = name
        while name in existing_names:
            name = orig_name + str(counter)
            counter += 1
        
        char = {
            'id': f'{scene_key}_{i+1:02d}',
            'scene': scene_key,
            'name': name,
            'description': desc_zh,
            'descriptionPinyin': desc_py,
            'attributes': attrs,
            'avatarParams': {
                'skinColor': skin,
                'hairColor': hair_color,
                'hairStyle': hair_style,
                'hasGlasses': combo['glasses'],
                'hasHat': combo['hat'],
                'clothesColor': clothes_color,
                'expression': expression,
                'gender': combo['gender'],
            }
        }
        characters.append(char)
    
    return characters


# ============================================================
# 生成所有场景
# ============================================================
all_scenes = {}
for scene_key in SCENES:
    characters = generate_24_characters(scene_key)
    all_scenes[scene_key] = {
        'sceneId': scene_key,
        'sceneName': SCENES[scene_key]['name'],
        'sceneNameId': SCENES[scene_key]['name_id'],
        'bgColor': SCENES[scene_key]['bg_color'],
        'characters': characters,
    }

output = {
    'scenes': all_scenes,
    'questionTemplates': [
        {'id': 'gender',      'zh': '是{男/女}吗？',      'attr': 'gender',      'type': 'exact'},
        {'id': 'age',         'zh': '是{年轻/中年/老年}吗？', 'attr': 'age',      'type': 'exact'},
        {'id': 'glasses',     'zh': '戴眼镜吗？',          'attr': 'glasses',     'type': 'bool'},
        {'id': 'hat',         'zh': '戴帽子吗？',           'attr': 'hat',         'type': 'bool'},
        {'id': 'clothesColor','zh': '穿{颜色}衣服吗？',     'attr': 'clothesColor','type': 'exact'},
        {'id': 'hairStyle',   'zh': '是{短/长}发吗？',      'attr': 'hairStyle',   'type': 'exact'},
        {'id': 'expression',  'zh': '很{开心/难过}吗？',    'attr': 'expression',  'type': 'exact'},
        {'id': 'action',      'zh': '在{动作}吗？',         'attr': 'action',      'type': 'contains'},
    ]
}

with open('D:/chinese/src/data/guess_who_advanced.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

# Print stats
for scene_key, scene_data in all_scenes.items():
    chars = scene_data['characters']
    print(f"\n场景【{scene_data['sceneName']}】{len(chars)} 张:")
    for i, c in enumerate(chars[:3]):
        print(f"  {c['name']}: {c['description'][:40]}...")
    
    # 验证多样性
    genders = [c['attributes']['gender'] for c in chars]
    ages = [c['attributes']['age'] for c in chars]
    glasses = [c['attributes']['glasses'] for c in chars]
    hats = [c['attributes']['hat'] for c in chars]
    print(f"  男:{genders.count('男')} 女:{genders.count('女')} | 年轻:{ages.count('年轻')} 中年:{ages.count('中年')} 老年:{ages.count('老年')}")
    print(f"  戴眼镜:{glasses.count(True)} 不戴:{glasses.count(False)} | 戴帽子:{hats.count(True)} 不戴:{hats.count(False)}")

print(f"\n已保存到 D:/chinese/src/data/guess_who_advanced.json")
