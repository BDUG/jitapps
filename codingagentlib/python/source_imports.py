"""Resolve static Python imports against indexed snapshots without executing code."""
from pathlib import PurePosixPath


class PythonImports:
    def __init__(self):
        self.canonical = {}
        self.paths = {}
        self.requests = []
        self.limited = False

    def register(self, path, identity):
        parts = list(PurePosixPath(path).with_suffix('').parts)
        if parts[-1] == '__init__':
            parts.pop()
        self.canonical.setdefault('.'.join(parts), set()).add(identity)
        self.paths[identity] = path

    def add(self, source, path, module, *, level=0, names=()):
        if len(self.requests) >= 11000:
            self.limited = True
            return
        self.requests.append((source, path, module, level, tuple(names)))

    def resolve(self):
        modules = {name: set(ids) for name, ids in self.canonical.items()}
        # A conventional src directory is a search root, unless indexed as a package.
        src_root = 'src' not in self.canonical
        if src_root:
            for name, ids in self.canonical.items():
                if name.startswith('src.'):
                    modules.setdefault(name[4:], set()).update(ids)
        result, warnings = [], []
        for source, path, module, level, names in self.requests:
            parent = list(PurePosixPath(path).parent.parts)
            search_root = 1 if src_root and parent[:1] == ['src'] else 0
            root_package = '' in self.canonical and not search_root
            depth = len(parent) - search_root + int(root_package)
            outside = bool(level and level > depth)
            anchor = parent[:len(parent) - level + 1] if level and not outside else []
            base = '.'.join([*anchor, *([module] if module else [])])
            for name in names or (None,):
                suffix = name if name and name != '*' else ''
                if outside:
                    requested = '.' * level + (module or '')
                    requested += ('.' if module else '') + suffix if suffix else ''
                else:
                    requested = '.'.join(v for v in (base, suffix) if v)
                choices = [requested, base] if suffix else [base]
                matches = set()
                if not outside:
                    for candidate in choices:
                        matches = (self.canonical if level else modules).get(candidate, set())
                        if matches:
                            break
                target = next(iter(matches)) if len(matches) == 1 else None
                ambiguous = len(matches) > 1
                if ambiguous:
                    warnings.append(path + ': ambiguous Python import ' + requested)
                # Preserve the external module identity for `from external import attr`.
                label = base if module and not matches and not outside else requested
                result.append(dict(source=source, target=target, label=label or '.' * level,
                                   ambiguous=ambiguous,
                                   candidates=sorted(self.paths[key] for key in matches)[:8]))
        if self.limited:
            warnings.append('Python imports limited to 11,000 references')
        return result, warnings
