import re

file_path = '../lt316-ui-port/src/components/admin/TemplateCreateForm.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Split by conflict markers
parts = re.split(r'<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> [^\n]+\n', content, flags=re.DOTALL)

# parts[0] is text before 1st conflict
# parts[1] is HEAD for 1st conflict
# parts[2] is 4ee4ec2 for 1st conflict
# parts[3] is text between 1st and 2nd conflict
# ...

new_content = parts[0]

# Conflict 1
new_content += parts[1]  # Keep HEAD
new_content += parts[3]

# Conflict 2
new_content += parts[4]  # Keep HEAD
new_content += parts[6]

# Conflict 3
new_content += '''      <div className={styles.section}>
        <div className={styles.sectionTitle}>Diameter authority</div>
        <div className={styles.sectionLead}>
          Diameter is the only body scale authority. Other measurements are reference context and do not prove BODY CUTOUT QA scale.
        </div>
'''
new_content += parts[9]

# Conflict 4
new_content += '''        <div className={styles.section}>
          <div className={styles.sectionTitle}>Reference engravable zone</div>
          <div className={styles.sectionLead}>
            This visual band helps workspace/export context. BODY CUTOUT QA scale still comes from diameter plus accepted BODY REFERENCE.
          </div>
'''
new_content += parts[12]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)
print("Fixed conflicts in TemplateCreateForm.tsx")
