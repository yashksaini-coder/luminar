window.__commits = []; window.__rendered = {};
window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1 }, checkDCE() {}, onScheduleFiberRoot() {}, onPostCommitFiberRoot() {}, onCommitFiberUnmount() {},
  onCommitFiberRoot(id, root) {
    window.__commits.push(performance.now())
    const walk = f => { for (; f; f = f.sibling) { if (typeof f.type === 'function' && (f.flags & 1) && f.alternate) { const n = f.type.displayName || f.type.name || '?'; window.__rendered[n] = (window.__rendered[n] || 0) + 1 } walk(f.child) } }
    walk(root.current.child)
  } };
