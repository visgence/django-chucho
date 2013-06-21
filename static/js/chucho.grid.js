//This is to use AMD if we are running require.js 
(function (factory){
(function(window,document,navigator,$,ko,Spinner,undefined){
!function(factory) {    
    if (typeof define === 'function' && define.amd) {
        define(['exports','jquery','knockout'],factory);
    }
    else {
        factory(window['DataGrid'] = {},$,ko,Spinner);   
    }
}(function(exports,$,ko) {

    ko.chuchoGrid = {
        // Defines a view model class you can use to populate a grid
        viewModel: function (configuration) {
            this.data = configuration.data;
            this.columns = configuration.columns;
        }
    };

    // Templates used to render the grid
    var templateEngine = new ko.jqueryTmplTemplateEngine();
    templateEngine.addTemplate("ko_chuchoGrid_grid", "\
                    <table class=\"chucho-grid table table-bordered\" cellspacing=\"0\">\
                        <thead>\
                            <tr>\
                                {{each(i, columnDefinition) columns}}\
                                    <th data-bind=\"sortHandler: columnDefinition\">${ columnDefinition.name }</th>\
                                {{/each}}\
                            </tr>\
                        </thead>\
                        <tbody>\
                            {{each(i, row) data}}\
                                <tr data-row=\"${i}\" data-bind=\"clickHandler: i\"  class=\"${ i % 2 == 0 ? 'odd' : 'even' }\">\
                                    {{each(j, columnDefinition) columns}}\
                                        <td>${ typeof columnDefinition.field == 'function' ? columnDefinition.field(row) : row[columnDefinition.field] }</td>\
                                    {{/each}}\
                                </tr>\
                            {{/each}}\
                        </tbody>\
                    </table>");

    // The "chuchoGrid" binding
    ko.bindingHandlers.chuchoGrid = {
        // This method is called to initialize the node, and will also be called again if you change what the grid is bound to
        update: function (element, viewModelAccessor, allBindingsAccessor) {
            var viewModel = viewModelAccessor(), allBindings = allBindingsAccessor();
            
            // Empty the element
            while(element.firstChild)
                ko.removeNode(element.firstChild);

            // Allow the default templates to be overridden
            var gridTemplateName      = allBindings.chuchoGridTemplate || "ko_chuchoGrid_grid",
                pageLinksTemplateName = allBindings.chuchoGridPagerTemplate || "ko_chuchoGrid_pageLinks";

            // Render the main grid
            var gridContainer = element.appendChild(document.createElement("DIV"));
            ko.renderTemplate(gridTemplateName, viewModel, { templateEngine: templateEngine }, gridContainer, "replaceNode");
        }
    };
});
})(window,document,navigator,window["$"],window["ko"]);
})();
