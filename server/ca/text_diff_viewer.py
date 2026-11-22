
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import difflib

class TextDiffViewer:
    def __init__(self, root):
        self.root = root
        self.root.title("Text File Diff Viewer")
        self.root.geometry("800x600")
        
        self.file1_path = tk.StringVar()
        self.file2_path = tk.StringVar()
        
        top_frame = tk.Frame(root)
        top_frame.pack(fill=tk.X, padx=10, pady=5)
        
        tk.Button(top_frame, text="Select File 1", command=self.select_file1).pack(side=tk.LEFT, padx=5)
        tk.Label(top_frame, textvariable=self.file1_path).pack(side=tk.LEFT, padx=5)
        tk.Button(top_frame, text="Select File 2", command=self.select_file2).pack(side=tk.LEFT, padx=5)
        tk.Label(top_frame, textvariable=self.file2_path).pack(side=tk.LEFT, padx=5)
        tk.Button(top_frame, text="Compare", command=self.compare_files).pack(side=tk.RIGHT, padx=5)
        
        columns = ('line_num', 'file1_line', 'file2_line', 'status')
        self.tree = ttk.Treeview(root, columns=columns, show='headings')
        self.tree.heading('line_num', text='#')
        self.tree.heading('file1_line', text='File 1')
        self.tree.heading('file2_line', text='File 2')
        self.tree.heading('status', text='Status')
        self.tree.column('line_num', width=50)
        self.tree.column('file1_line', width=300)
        self.tree.column('file2_line', width=300)
        self.tree.column('status', width=100)
        self.tree.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        scrollbar = ttk.Scrollbar(root, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

    def select_file1(self):
        path = filedialog.askopenfilename(title="Select First File")
        if path:
            self.file1_path.set(path)

    def select_file2(self):
        path = filedialog.askopenfilename(title="Select Second File")
        if path:
            self.file2_path.set(path)

    def compare_files(self):
        f1 = self.file1_path.get()
        f2 = self.file2_path.get()
        
        if not f1 or not f2:
            messagebox.showwarning("Warning", "Please select both files.")
            return
            
        with open(f1, 'r') as file1:
            lines1 = file1.readlines()
        with open(f2, 'r') as file2:
            lines2 = file2.readlines()
            
        diff = difflib.unified_diff(lines1, lines2, fromfile='File 1', tofile='File 2', lineterm='')
        
        for item in self.tree.get_children():
            self.tree.delete(item)
            
        line_num = 1
        for line in diff:
            if line.startswith('+'):
                status = "Added"
                f1_line = ""
                f2_line = line[1:]
            elif line.startswith('-'):
                status = "Removed"
                f1_line = line[1:]
                f2_line = ""
            else:
                status = "Context"
                f1_line = line
                f2_line = line
                
            self.tree.insert('', 'end', values=(line_num, f1_line.strip(), f2_line.strip(), status))
            line_num += 1

if __name__ == "__main__":
    root = tk.Tk()
    app = TextDiffViewer(root)
    root.mainloop()
