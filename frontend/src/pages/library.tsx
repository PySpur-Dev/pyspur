import React from 'react'
import Header from '../components/Header'
import Library from '../components/Library'

const LibraryPage: React.FC = () => {
    return (
        <div className="App relative">
            <Header activePage="library" />
            <Library />
        </div>
    )
}

export default LibraryPage
