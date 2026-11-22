
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import hashlib
import os

class DuplicateFinderApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Duplicate File Finder")
        self.root.geometry("600x400")
        
        self.target_dir = tk.StringVar()
        self.hash_map = {}
        
        frame_top = tk.Frame(root, padx=10, pady=10)
        frame_top.pack(fill=tk.X)
        
        tk.Label(frame_top, text="Select Directory:").pack(side=tk.LEFT)
        tk.Entry(frame_top, textvariable=self.target_dir, width=40).pack(side=tk.LEFT, padx=5)
        tk.Button(frame_top, text="Browse", command=self.browse_directory).pack(side=tk.LEFT)
        tk.Button(frame_top, text="Find Duplicates", command=self.find_duplicates).pack(side=tk.RIGHT, padx=5)
        
        columns = ('hash', 'size', 'path')
        self.tree = ttk.Treeview(root, columns=columns, show='headings')
        self.tree.heading('hash', text='Hash')
        self.tree.heading('size', text='Size')
        self.tree.heading('path', text='File Path')
        self.tree.column('hash', width=100)
        self.tree.column('size', width=100)
        self.tree.column('path', width=300)
        self.tree.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        scrollbar = ttk.Scrollbar(root, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

    def browse_directory(self):
        dir_path = filedialog.askdirectory()
        if dir_path:
            self.target_dir.set(dir_path)

    def get_file_hash(self, filepath):
        hasher = hashlib.md5()
        try:
            with open(filepath, 'rb') as f:
                for chunk in iter(lambda: f.read(8192), b''):
                    hasher.update(chunk)
            return hasher.hexdigest()
        except (IOError, OSError):
            return None

    def find_duplicates(self):
        directory = self.target_dir.get()
        if not directory:
            messagebox.showwarning("Warning", "Please select a directory first.")
            return
            
        self.hash_map.clear()
        for item in self.tree.get_children():
            self.tree.delete(item)
            
        for root_dir, dirs, files in os.walk(directory):
            for filename in files:
                filepath = os.path.join(root_dir, filename)
                file_size = os.path.getsize(filepath)
                file_hash = self.get_file_hash(filepath)
                
                if file_hash:
                    if file_hash in self.hash_map:
                        self.hash_map[file_hash].append(filepath)
                    else:
                        self.hash_map[file_hash] = [filepath]
                        
        duplicates_found = False
        for hash_val, paths in self.hash_map.items():
            if len(paths) > 1:
                duplicates_found = True
                for path in paths:
                    self.tree.insert('', 'end', values=(hash_val, os.path.getsize(path), path))
                    
        if not duplicates_found:
            messagebox.showinfo("Result", "No duplicates found.")
        else:
            messagebox.showinfo("Result", f"Found {len([h for h, p in self.hash_map.items() if len(p) > 1])} groups of duplicates.")

if __name__ == "__main__":
    root = tk.Tk()
    app = DuplicateFinderApp(root)
    root.mainloop()
