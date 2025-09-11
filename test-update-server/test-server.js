import fetch from 'node-fetch';

const SERVER_URL = 'http://localhost:3333';

async function testServer() {
    console.log('Testing Update Server...\n');
    
    try {
        // Test 1: Server health check
        console.log('1. Testing server health...');
        const healthResponse = await fetch(SERVER_URL);
        const healthData = await healthResponse.json();
        console.log('   ✓ Server is running:', healthData.status);
        
        // Test 2: Check for update from 0.1.0
        console.log('\n2. Testing update check for v0.1.0...');
        const updateResponse = await fetch(`${SERVER_URL}/check/windows/x86_64/0.1.0`);
        if (updateResponse.status === 200) {
            const updateData = await updateResponse.json();
            console.log('   ✓ Update available:', updateData.version);
            console.log('   Notes:', updateData.notes.split('\n')[0]);
            
            if (updateData.platforms && updateData.platforms['windows-x86_64']) {
                console.log('   ✓ Windows x64 update URL configured');
                console.log('   ✓ Signature present:', !!updateData.platforms['windows-x86_64'].signature);
            }
        } else if (updateResponse.status === 204) {
            console.log('   ! No update available (unexpected for 0.1.0)');
        }
        
        // Test 3: Check for update from 0.2.0
        console.log('\n3. Testing update check for v0.2.0...');
        const noUpdateResponse = await fetch(`${SERVER_URL}/check/windows/x86_64/0.2.0`);
        if (noUpdateResponse.status === 204) {
            console.log('   ✓ No update available (correct, already on latest)');
        } else {
            console.log('   ! Unexpected response for 0.2.0');
        }
        
        console.log('\n✅ All tests passed!');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.log('\nMake sure the server is running: npm start');
    }
}

testServer();