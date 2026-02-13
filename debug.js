try {
    require('./server.js');
} catch (e) {
    console.log('----------------ERROR START----------------');
    console.log('CODE:', e.code);
    console.log('MESSAGE:', e.message);
    console.log('STACK:', e.stack);
    console.log('----------------ERROR END----------------');
}
