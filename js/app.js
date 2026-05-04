function zoomImage(img) {
    // If already zoomed, zoom out
    if (img.classList.contains('zoomed')) {
        img.classList.remove('zoomed');
        document.body.classList.remove('has-zoomed');
    } else {
        // Remove zoomed class from any other images just in case
        document.querySelectorAll('.image-gallery img').forEach(i => i.classList.remove('zoomed'));
        
        // Zoom this one
        img.classList.add('zoomed');
        document.body.classList.add('has-zoomed');
    }
}

// Close zoom when clicking the background
document.addEventListener('click', (e) => {
    if (e.target.tagName !== 'IMG' && document.body.classList.contains('has-zoomed')) {
        document.querySelectorAll('.image-gallery img').forEach(i => i.classList.remove('zoomed'));
        document.body.classList.remove('has-zoomed');
    }
}, true);