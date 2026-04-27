import re

file_path = '../lt316-ui-port/src/components/admin/EngravableZoneEditor.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

parts = re.split(r'<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> [^\n]+\n', content, flags=re.DOTALL)

new_content = parts[0]

# Conflict 1: Props interface
new_content += parts[2]
new_content += parts[3]

# Conflict 2: Component arguments
new_content += parts[5]
new_content += parts[6]

# Conflict 3: Readout/Sidebar UI
ui_part = parts[8].replace('mappedGuideFrame', 'guideFrame')
new_content += ui_part
new_content += parts[9]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)
print("Fixed EngravableZoneEditor.tsx")
