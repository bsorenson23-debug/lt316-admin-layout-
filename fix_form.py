import re

file_path = '../lt316-ui-port/src/components/admin/TemplateCreateForm.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

parts = re.split(r'<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> [^\n]+\n', content, flags=re.DOTALL)

# parts:
# 0: before 1st conflict
# 1: HEAD 1st
# 2: incoming 1st
# 3: between 1st and 2nd
# 4: HEAD 2nd
# 5: incoming 2nd
# 6: between 2nd and 3rd
# 7: HEAD 3rd
# 8: incoming 3rd
# 9: between 3rd and 4th
# 10: HEAD 4th
# 11: incoming 4th
# 12: after 4th

new_content = parts[0]

# Conflict 1: Imports (TumblerItemLookupResponse vs PrintableSurfaceContract etc)
# Keep incoming
new_content += parts[2]
new_content += parts[3]

# Conflict 2: Imports (buildBodyReferenceGlbSourceSignature vs Payload/GuideFrame)
# Keep incoming, but ensure buildBodyReferenceGlbSourceSignature is there
incoming_imports = parts[5]
if 'buildBodyReferenceGlbSourceSignature' not in incoming_imports:
    incoming_imports = incoming_imports.replace(
        'import { buildBodyReferenceGlbSourcePayload } from "@/lib/bodyReferenceGlbSource";',
        'import { buildBodyReferenceGlbSourceSignature, buildBodyReferenceGlbSourcePayload } from "@/lib/bodyReferenceGlbSource";'
    )
new_content += incoming_imports
new_content += parts[6]

# Conflict 3: resolveAxialBandBoundaryMm function addition
# Keep incoming
new_content += parts[8]
new_content += parts[9]

# Conflict 4: EngravableZoneEditor onChange wiring
# Keep incoming
new_content += parts[11]
new_content += parts[12]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)
print("Fixed TemplateCreateForm.tsx")
