import os
import re

# Define the directory containing the HTML files
html_dir = os.path.join('front-end', 'html')

# Function to fix paths in a file
def fix_paths(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Replace absolute paths with relative paths
    content = content.replace('/front-end/styles/', '../styles/')
    content = content.replace('/front-end/scripts/', '../scripts/')
    content = content.replace('/front-end/img/', '../img/')
    
    with open(file_path, 'w', encoding='utf-8') as file:
        file.write(content)
    
    print(f"Fixed paths in {file_path}")

# Process all HTML files in the directory
for filename in os.listdir(html_dir):
    if filename.endswith('.html'):
        file_path = os.path.join(html_dir, filename)
        fix_paths(file_path)

print("All paths fixed successfully!") 